"use strict";

/*
 * Variables and constants
 */

// Document elements
const nodeList = document.getElementById("node-list");
const linkList = document.getElementById("link-list");
const noteElems = document.getElementsByClassName("note");
var styleSheet = document.getElementById("style-sheet").sheet;

// Web audio API
const audioContext = new AudioContext();
const primaryGainControl = audioContext.createGain();
primaryGainControl.connect(audioContext.destination);
primaryGainControl.gain.setValueAtTime(0.2, 0);

// Maps
var noteCounts = {
    "C": 0,
    "C#": 0,
    "D": 0,
    "D#": 0,
    "E": 0,
    "F": 0,
    "F#": 0,
    "G": 0,
    "G#": 0,
    "A": 0,
    "A#": 0,
    "B": 0
};
const noteNumberMap = { // Used for calculated half steps between notes and thus their dissonance level
    "C": 0,
    "C#": 1,
    "D": 2,
    "D#": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "G": 7,
    "G#": 8,
    "A": 9,
    "A#": 10,
    "B": 11
};
const colourMap = { // Used for colouring links by their dissonance level
    "1": "#61abf5",
    "2": "#75d2ee",
    "3": "#d1ebe3",
    "4": "#f6e885",
    "5": "#f19641",
    "6": "#e30808",
}

// Counters
var noteIDCounter = 1;
var linkIDCounter = 1;



/*
 * Initial Logic
 */

// Set colors of dissonance levels
for (let i = 1; i <= 6; i++) {
    let rule = `
    .dissonance-level-${i} {
        background-color: ${colourMap[i]};
    }
    `;
//    styleSheet.insertRule(rule, 0);
    document.styleSheets[0].insertRule(rule, 0);
}

// Setting up note objects
/* 
 * noteMap has the following form:
 * 
 *  {
 *     "c3": {
 *          oscillator: ___,
 *          gainNode: ___,
 *          numberValue: 1,
 *          frequency: ___,
 *      },
 *      "c#3": {
 *          oscillator: ___,
 *          gainNode: ___,
 *          numberValue: 2,
 *          frequency: ___,
 *      },
 *      "d3": {
 *          oscillator: ___,
 *          gainNode: ___,
 *          numberValue: 3,
 *          frequency: ___,
 *      },
 *      ...
 *  }
 *  
 */
var noteMap = {};
{   
    let halfStepRatio = 1.05946309436; // This is 2^(1/12) the ratio needed to go up a half step
    let c3Frequency = 130.8128; // This is the base frequency which we multiply to get all others
    let letters = [
        "c3", "c#3", "d3", "d#3", "e3", "f3", "f#3", "g3", "g#3", "a3", "a#3", "b3", 
        "c4", "c#4", "d4", "d#4", "e4", "f4", "f#4", "g4", "g#4", "a4", "a#4", "b4", 
        "c5"];
    for (let i = 0; i < letters.length; i++) {
        noteMap[letters[i]] = {
            oscillator: audioContext.createOscillator(),
            gainNode: audioContext.createGain(),
            numberValue: i,
            frequency: c3Frequency * (halfStepRatio ** i) * 2
        };

        let oscillator = noteMap[letters[i]].oscillator;
        let gainNode = noteMap[letters[i]].gainNode;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(noteMap[letters[i]].frequency, 0);
        oscillator.start();
        gainNode.gain.setValueAtTime(0, 0);

        oscillator.connect(gainNode);
        gainNode.connect(primaryGainControl);
    }
}



/*
 * Event listeners
 */

// Handle note clicks
for (let i = 0; i < noteElems.length; i++) {
    noteElems.item(i).addEventListener("click", selectNote);
};



/*
 * Functions
 */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Get dissonance level from interval by # of half steps
function getDissonanceLevel(halfSteps) {
    // Exploits a symmetry to allow for a smaller map
    let intervalId = 6 - Math.abs(6 - halfSteps);
    let intervalMap = {
        "1": 5,
        "2": 4,
        "3": 3,
        "4": 2,
        "5": 1,
        "6": 6 
    }
    return intervalMap[intervalId];
}

// Convert string to html element
function stringToElement(string) {
    const template = document.createElement("template");
    template.innerHTML = string.trim();
    return template.content.firstElementChild;
}

// Handle updating the graph + noteList when a user selects a new note
function selectNote(e) {
    let note = e.target;
    let noteLetter = note.dataset.noteLetter;
    let gainNode = noteMap[note.id].gainNode;

    // Check whether keyboard note was already selected
    if (note.classList.contains("selected")) {
        note.classList.remove("selected");
        removeNode(noteLetter);
        gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.2);    
    } else {
        note.classList.add("selected");
        addNode(noteLetter);
        audioContext.resume();
        gainNode.gain.setTargetAtTime(500 / noteMap[note.id].frequency, audioContext.currentTime, 0.1);
        gainNode.gain.setTargetAtTime(130 / noteMap[note.id].frequency, audioContext.currentTime + 0.2, 0.2);
        
    }
}

// Handle the adding of a new note. Perform checks in case the node is already present
function addNode(noteLetter) {
    noteCounts[noteLetter] += 1;

    // Do nothing if there are now 2 selected notes on the keyboard and thus the node was already present
    if (noteCounts[noteLetter] >= 2) {
        return;
    }

    let newNode = stringToElement(`
    <li class="node" id="node-${noteIDCounter}" data-node-letter="${noteLetter}">${noteLetter}</li>
    `);
    noteIDCounter++;

    // Adding the node into the dom and make it draggable
    nodeList.appendChild(newNode);
    makeDraggable(newNode);
    
    // Create links to each other node
    let nodes = nodeList.getElementsByClassName("node");
    for (let i = 0; i < nodes.length; i++) {
        addLink(nodes[i], newNode);
    }
}

function removeNode(noteLetter) {
    noteCounts[noteLetter] -= 1;

    // Do nothing if the note is still selected somewhere on the keyboard and thus the node should remain present
    if (noteCounts[noteLetter] >= 1) {
        return;
    }

    // for each node, check if it corresponds to the removed note. If so, remove it and it's links and terminate the function
    let nodes = nodeList.getElementsByClassName("node");
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].dataset.nodeLetter == noteLetter) {
            removeLinks(nodes[i]);
            nodes[i].remove();
            return;
        }
    }
}

function addLink(node1, node2) {
    // Don't link a node to itself
    if (node1 == node2) {
        return;
    }

    // Calculate dissonance value
    // Get # of half steps in between
    let halfSteps = Math.abs(noteNumberMap[node2.dataset.nodeLetter] - noteNumberMap[node1.dataset.nodeLetter]);
    let dissonanceLevel = getDissonanceLevel(halfSteps);
    let colour = colourMap[dissonanceLevel];

    // Get coords for 2 node points
    let x1 = node1.offsetLeft - 48 + node1.clientWidth / 2;
    let y1 = node1.offsetTop - 16 + node1.clientHeight / 2;
    let x2 = node2.offsetLeft - 48 + node2.clientWidth / 2;
    let y2 = node2.offsetTop - 16 + node2.clientHeight / 2;

    // Create link and add it to the dom
    let newLink = stringToElement(`
    <li class="link" id="link-${linkIDCounter}" data-input-node="${node1.id}" data-output-node="${node2.id}">
        <svg height="700" width="1440">
            <path id="link-${linkIDCounter}-path" d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${colour}" stroke-width="5"/>
            <!-- <circle id="link-${linkIDCounter}-circle" cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="10" fill="${colour}"/> -->
        </svg>
    </li>
    `);
    linkIDCounter++;
    linkList.appendChild(newLink);
}

function removeLinks(node) {
    // Get associated links
    let links = document.querySelectorAll('[data-input-node="' + node.id + '"], [data-output-node="' + node.id + '"]') || [];
    // Remove each link
    links.forEach(link => {
        link.remove();
    });
}

function makeDraggable(node) {
    node.onmousedown = (e) => {
        e = e || window.event;
        e.preventDefault();

        // Get associated links
        let inputLinks = document.querySelectorAll('[data-input-node="' + node.id + '"]') || [];
        let outputLinks = document.querySelectorAll('[data-output-node="' + node.id + '"]') || [];

        let dx = 0;
        let dy = 0;
        let mouseX = e.clientX;
        let mouseY = e.clientY;
        // let elemX0 = node.offsetLeft;
        // let elemY0 = node.offsetTop;
        
        // When mouse is released
        document.onmouseup = () => {
            // Stop further calling of the function
            document.onmouseup = null;
            // Stop moving
            document.onmousemove = null;
        
        }

        // TODO
        document.onmousemove = (e) => {
            e = e || window.event;
            e.preventDefault();

            // Calculate new cursor position
            dx = e.clientX - mouseX;
            dy = e.clientY - mouseY;
            mouseX = e.clientX;
            mouseY = e.clientY;
            // Set new position 
            node.style.left = (node.offsetLeft + dx) + "px";
            node.style.top = (node.offsetTop + dy) + "px";
            
            for (let i = 0; i < inputLinks.length; i++) {
                // Get path and text
                let link = inputLinks[i];
                let path = document.getElementById(link.getAttribute("id") + "-path");
                let circle = document.getElementById(link.getAttribute("id") + "-circle");

                // Parse d attribute
                // Example of d: "M 130 100 D 320 250" - 4 numbers, 6 tokens
                let dArray = path.getAttribute("d").split(" ");
                let x1 = dArray[1];
                let y1 = dArray[2];
                let x2 = dArray[4];
                let y2 = dArray[5];

                // Set the new coords. Only need to change x2 and y2 because this is the input node / node1
                path.setAttribute("d", `M ${+x1 + dx} ${+y1 + dy} L ${x2} ${y2}`);
                // circle.setAttribute("cx", Math.abs((+x1 + dx + +x2)) / 2);
                // circle.setAttribute("cy", Math.abs((+y1 + dy + +y2)) / 2);

            }

            for (let i = 0; i < outputLinks.length; i++) {
                let link = outputLinks[i];
                let path = document.getElementById(link.getAttribute("id") + "-path");
                let circle = document.getElementById(link.getAttribute("id") + "-circle");

                let dArray = path.getAttribute("d").split(" ");
                let x1 = dArray[1];
                let y1 = dArray[2];
                let x2 = dArray[4];
                let y2 = dArray[5];

                // Set the new coords. Only need to change x2 and y2 because this is the output node / node2
                path.setAttribute("d", `M ${x1} ${y1} L ${+x2 + dx} ${+y2 + dy}`);
                // circle.setAttribute("cx", Math.abs((+x1 + +x2 + dx)) / 2);
                // circle.setAttribute("cy", Math.abs((+y1 + +y2 + dy)) / 2);
            }
        }
    }
}
