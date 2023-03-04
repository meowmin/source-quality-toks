// ==UserScript==
// @name         Source Quality Toks
// @version      1.0
// @description  Replaces toks with source quality originals from tikwm.com when available. Press E to play toks if autoplay doesn't work.
// @author       (You)
// @downloadURL  https://raw.githubusercontent.com/meowmin/source-quality-toks/main/source-quality-toks.user.js
// @match        https://nekochen.net/tt/*
// @match        https://sturdychan.help/tv/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    let lastHovered = null;
    let hoveredTokID = null;

    let checkedTokIDs = new Map();

    function getTokID(filename) {
        const now = new Date();
        const maxTokID = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).getTime() / 1000 * Math.pow(2, 32);
        const minTokID = 6313705004335104000;

        function isValidTokID(digits) {
            const numDigits = digits.length
            if (numDigits < 19 || numDigits > 20) {
                return false
            }
            const tokID = parseInt(digits, 10);
            return tokID > minTokID && tokID < maxTokID;
        }

        let digits = '';
        for (const c of filename) {
            if (c >= '0' && c <= '9') {
                digits += c;
            } else {
                if (isValidTokID(digits)) {
                    return digits;
                }
                digits = '';
            }
        }
        if (isValidTokID(digits)) {
            return digits;
        }
        return null;
    }

    function onThumbnailHover(event) {
        const target = event.target
        if (!(target.matches && target.matches("figure img"))) return
        //Check if a new tok is hovered
        if (lastHovered == target) {
            return;
        }
        lastHovered = target;
        hoveredTokID = null;
        let article = target.closest("article");
        let tokLink = article.querySelector("figcaption a[download]");
        if (tokLink == null) {
            return;
        }
        if (!(tokLink.href.endsWith(".mp4") || tokLink.href.endsWith(".webm"))) {
            return;
        }
        //Check if file is already HEVC
        let codec = article.querySelector(".fileinfo > span:last-child");
        if (codec != null && codec.innerText == "HEVC") {
            return;
        }
        let tokName = tokLink.getAttribute("download");
        let tokID = getTokID(tokName);
        if (tokID != null) {
            hoveredTokID = tokID;
            if (!checkedTokIDs.has(tokID)) {
                try {
                    let tikwmURL = fetch("https://tikwm.com/video/media/hdplay/" + tokID + ".mp4");
                    checkedTokIDs.set(tokID, tikwmURL);
                    tikwmURL.then((resp) => {
                            checkedTokIDs.set(tokID, resp.url);
                        })
                        .catch((e) => {
                            checkedTokIDs.set(tokID, null);
                        });
                } catch (err) {
                    checkedTokIDs.set(tokID, null);
                }
            }
        } else {
            hoveredTokID = null;
        }
    }

    function setStatusIndicatorColor(color) {
        statusIndicator.style.color = color;
    }
    async function overlayMutationObserver(mutation) {
        if (mutation[0].removedNodes.length > 0) {
            setStatusIndicatorColor("gray");
        }
        if (mutation[0].addedNodes.length == 0) {
            return;
        }
        let video = mutation[0].addedNodes[0];
        if (video.tagName != "VIDEO" || hoveredTokID == null) {
            return;
        }
        let oldSrc = video.src;
        video.removeAttribute("src");
        if (hoveredTokID == null) {
            return;
        }
        let tikwmURL = checkedTokIDs.get(hoveredTokID);
        if (tikwmURL instanceof Promise) {
            setStatusIndicatorColor("yellow");
            try {
                let resp = await tikwmURL;
                if (video.isConnected) {
                    video.setAttribute("src", resp.url);
                    setStatusIndicatorColor("lime");
                }
            } catch (e) {
                if (video.isConnected) {
                    video.setAttribute("src", oldSrc);
                    setStatusIndicatorColor("gray");
                }
            }
        } else {
            if (tikwmURL != null) {
                video.setAttribute("src", tikwmURL);
                setStatusIndicatorColor("lime");
            } else {
                video.setAttribute("src", oldSrc);
                setStatusIndicatorColor("gray");
            }
        }
    }

    async function postExpansionObserver(mutations) {
        //iterate over mutations and find an index where target has tag "FIGURE"
        for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].target.tagName === "FIGURE") {
                if (mutations[i].addedNodes.length == 0) {
                    continue;
                }
                let video = mutations[i].addedNodes[0];
                if (video.matches("video.expanded")) {
                    let oldSrc = video.src;
                    video.removeAttribute("src")
                    let tikwmURL = checkedTokIDs.get(hoveredTokID);
                    if (tikwmURL instanceof Promise) {
                        try {
                            let resp = await tikwmURL;
                            if (video.isConnected) {
                                video.setAttribute("src", resp.url);
                            }
                        } catch (e) {
                            if (video.isConnected) {
                                video.setAttribute("src", oldSrc);
                            }
                        }
                    } else {
                        if (tikwmURL != null) {
                            video.setAttribute("src", tikwmURL);
                        } else {
                            video.setAttribute("src", oldSrc);
                        }
                    }
                }
            }
        }
    }
    let threads = document.getElementById("threads");
    let threadsObserver = new MutationObserver(postExpansionObserver);
    threadsObserver.observe(threads, {
        childList: true,
        attributes: false,
        subtree: true
    });
    let overlayMutObserver = new MutationObserver(overlayMutationObserver);
    let overlay = document.getElementById("hover-overlay")
    if (overlay != null) {
        overlayMutObserver.observe(overlay, {
            childList: true,
            attributes: false,
            subtree: false
        });
    }
    document.addEventListener("mousemove", onThumbnailHover, {
        passive: true,
    })
    document.addEventListener('keydown', function (event) {
        if (event.code === 'KeyE') {
            let video = document.querySelector("#hover-overlay > video");
            if (video != null) {
                video.play();
            }
        }
    });
    let statusIndicator = document.createElement("b");
    statusIndicator.innerText = "SQ";
    setStatusIndicatorColor("gray");
    document.getElementById("thread-post-counters").after(statusIndicator);
})();
