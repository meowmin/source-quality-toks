// ==UserScript==
// @name         Source Quality Toks
// @version      1.0
// @description  Replaces toks with source quality originals from tikwm.com when available. Press E to play toks if autoplay doesn't work.
// @author       (You)
// @downloadURL  https://raw.githubusercontent.com/meowmin/source-quality-toks/main/source-quality-toks.user.js
// @match        https://nekochen.net/tt/*
// @match        https://sturdychan.help/tv/*
// ==/UserScript==

(function () {
    'use strict';
    let lastHovered = null;
    let currentTokID = null;
    let checkedTokIDs = new Map();
    let fetchedTokIDs = new Map();

    function addCheckedTokEntry(tokID, value) {
        checkedTokIDs.set(tokID, value);
    }

    function fetchSourceURL(id) {
        if (fetchedTokIDs.has(id) || checkedTokIDs.has(id))
            return;
        try {
            let tikwmURL = fetch("https://tikwm.com/video/media/hdplay/" + id + ".mp4");
            fetchedTokIDs.set(id, tikwmURL);
            tikwmURL
                .then((resp) => {
                    addCheckedTokEntry(id, resp.url);
                })
                .catch((e) => {
                    addCheckedTokEntry(id, null);
                })
                .finally(() => {
                    fetchedTokIDs.delete(id);
                });
        } catch (err) {
            addCheckedTokEntry(id, null);
            fetchedTokIDs.delete(id);
        }
    }

    async function getSourceURL(id, loadingCallback = null) {
        if (fetchedTokIDs.has(id)) {
            if (loadingCallback != null)
                loadingCallback();
            try {
                let resp = await fetchedTokIDs.get(id);
                return resp.url;
            } catch (e) {
                return null;
            }
        } else {
            return checkedTokIDs.get(id);
        }
    }

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
        currentTokID = null;
        let article = target.closest("article");
        fetchSourceFromArticle(article)
    }

    function handleSource404(element, tokID, originalURL) {
        element.src = originalURL;
        addCheckedTokEntry(tokID, null);
    }

    function fetchSourceFromArticle(article) {
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
            currentTokID = tokID;
            fetchSourceURL(tokID);
        } else {
            currentTokID = null;
        }
    }

    function setStatusIndicatorColor(color) {
        statusIndicator.style.color = color;
    }

    async function hoverPlayerObserver(mutation) {
        if (mutation[0].removedNodes.length > 0) {
            setStatusIndicatorColor("gray");
        }
        if (mutation[0].addedNodes.length == 0) {
            return;
        }
        let video = mutation[0].addedNodes[0];
        if (video.tagName != "VIDEO" || currentTokID == null) {
            return;
        }
        if (currentTokID == null) {
            return;
        }
        let oldSrc = video.src;
        video.removeAttribute("src");
        let sourceURL = await getSourceURL(currentTokID, () => {
            setStatusIndicatorColor("yellow");
        });
        if (!video.isConnected) {
            return;
        }
        if (sourceURL == null) {
            video.src = oldSrc;
            setStatusIndicatorColor("gray");
        } else {
            video.src = sourceURL;
            video.onerror = () => {
                handleSource404(video, currentTokID, oldSrc)
            }
            setStatusIndicatorColor("lime");
        }
    }

    async function expansionPlayerObserver(mutations) {
        //iterate over mutations and find an index where target has tag "FIGURE"
        for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].target.tagName === "FIGURE") {
                if (mutations[i].addedNodes.length == 0) {
                    continue;
                }
                let video = mutations[i].addedNodes[0];
                if (video.matches("video.expanded")) {
                    fetchSourceFromArticle(video.closest("article"))
                    let oldSrc = video.src;
                    video.removeAttribute("src")
                    let sourceURL = await getSourceURL(currentTokID);
                    if (!video.isConnected) {
                        return;
                    }
                    if (sourceURL == null) {
                        video.src = oldSrc;
                    } else {
                        video.src = sourceURL;
                        video.onerror = () => {
                            handleSource404(video, currentTokID, oldSrc)
                        }
                    }
                }
            }
        }
    }

    let rotations = [
        {name: "0", transform: "none", maxHeight: "100%", maxWidth: "100%"},
        {name: "-90", transform: "rotate(-90deg)", maxHeight: "100vw", maxWidth: "calc(100vh - 1.5em)"},
        {name: "180", transform: "rotate(180deg)", maxHeight: "100%", maxWidth: "100%"},
        {name: "90", transform: "rotate(90deg)", maxHeight: "100vw", maxWidth: "calc(100vh - 1.5em)"},
    ]

    function rotateTokCW() {
        let video = document.querySelector("#hover-overlay > *");
        if (video == null) {
            return;
        }
        let rotation = "0";
        if ("rotation" in video.dataset) {
            rotation = video.dataset.rotation;
        }
        let index = rotations.findIndex((rot) => rot.name == rotation);
        let nextIndex = (index - 1 + rotations.length) % rotations.length;
        video.dataset.rotation = rotations[nextIndex].name;
        video.style.transform = rotations[nextIndex].transform;
        video.style.maxHeight = rotations[nextIndex].maxHeight;
        video.style.maxWidth = rotations[nextIndex].maxWidth;
    }

    function rotateTokCCW() {
        let video = document.querySelector("#hover-overlay > *");
        if (video == null) {
            return;
        }
        let rotation = "0";
        if ("rotation" in video.dataset) {
            rotation = video.dataset.rotation;
        }
        let index = rotations.findIndex((rot) => rot.name == rotation);
        let nextIndex = (index + 1) % rotations.length;
        video.dataset.rotation = rotations[nextIndex].name;
        video.style.transform = rotations[nextIndex].transform;
        video.style.maxHeight = rotations[nextIndex].maxHeight;
        video.style.maxWidth = rotations[nextIndex].maxWidth;
    }

    function resetCurrentTok(){
        let article = document.querySelector("article:hover");
        if(article == null)
            return
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
        checkedTokIDs.delete(tokID)
    }

    let threads = document.getElementById("threads");
    let threadsObserver = new MutationObserver(expansionPlayerObserver);
    threadsObserver.observe(threads, {
        childList: true,
        attributes: false,
        subtree: true
    });
    let overlayMutObserver = new MutationObserver(hoverPlayerObserver);
    let overlay = document.getElementById("hover-overlay")
    overlayMutObserver.observe(overlay, {
        childList: true,
        attributes: false,
        subtree: false
    });
    document.addEventListener("mousemove", onThumbnailHover, {
        passive: true,
    })
    document.addEventListener('keydown', function (event) {
        let inInput = 'selectionStart' in event.target
        if (inInput)
            return;
        if (event.code === 'KeyE') {
            let video = document.querySelector("#hover-overlay > video");
            if (video != null) {
                video.play();
            }
        }urrentTok();
        // }
    });
    let statusIndicator = document.createElement("a");
    statusIndicator.innerText = "SQ";
    setStatusIndicatorColor("gray");
    document.getElementById("thread-post-counters").after(statusIndicator);
    let infoPanel = document.createElement('div');
    infoPanel.setAttribute('id', 'SQT-info');
    infoPanel.setAttribute('class', 'modal glass');
    infoPanel.setAttribute('style', 'display: block;');
    infoPanel.textContent = 'Press E to play videos if stuck';
    statusIndicator.onclick = () => {
        let info = document.getElementById("SQT-info");
        if (info == null) {
            let overlay = document.getElementById("modal-overlay");
            overlay.prepend(infoPanel);
        } else {
            if (info.style.display == "block")
                info.style.display = "none";
            else
                info.style.display = "block";
        }
    }
})();
