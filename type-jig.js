/* -----------------------------------------------------------------------
 * TypeJig - run a typing lesson.
 *
 * `output`, `input`, and `clock` are elements (or element ID strings),
 * `exercise` is a TypeJig.Exercise object.
 */

// TODO:
// - Lookahead should be in characters, not words.
// - Show steno strokes.

function TypeJig(exercise, output, input, clock) {
	if(typeof(output) === 'string') output = document.getElementById(output);
	if(typeof(input) === 'string') input = document.getElementById(input);
	if(typeof(clock) === 'string') clock = document.getElementById(clock);
	this.running = false;
	this.haveFinalWord = false;
	this.ex = exercise;
	this.clock = new TypeJig.Timer(clock, this.ex.seconds);
	this.out = new ScrollBox(output, 5, input);
	this.ans = input;
	this.lookahead = [];
	this.errors = {};  this.errorCount = 0;
	this.getWords();
	this.scrollTo = this.out.firstChild;
	bindEvent(input, 'input', this.answerChanged.bind(this));
	input.focus();
	window.scroll(0, scrollOffset(output));
}

TypeJig.prototype.answerChanged = function() {
	if(!this.start) {
		this.clock.start();
		this.start = Date.now();
		if(this.ex.seconds) {
			window.setTimeout(this.endExercise.bind(this), 1000 * this.ex.seconds);
		}
		this.running = true;
	}

	// Get the string and split it into words.
	var answerString = this.ans.textContent;
	var answer = answerString.split(/\s+/);
	if(answer[0] === '') answer.shift();

	// Match up answer words against exercise words, and set the class
	// of the output span.
	this.getWords(answer.length);  // Try to get enough words to match.
	var out = this.scrollTo;
	var n = this.lookahead.length;
	for(var i=0; i<n; ++i) {
		var ex = this.lookahead[i];
		var ans = answer[i];
		var validPrefix = false;
		if(i === answer.length-1 && ans.length < ex.length) {
			validPrefix = ans === ex.slice(0, ans.length);
		}
		if(validPrefix || i >= answer.length) {
			if(hasClass(out, 'incorrect')) this.removeError(ex);
			out.className = '';
		} else if(ans === ex) {
			if(hasClass(out, 'incorrect')) this.removeError(ex);
			out.className = 'correct';
		} else {
			if(!hasClass(out, 'incorrect')) {
				this.addError(ex, ans);
				out.className = 'incorrect';
			}
		}
		if(out) out = out.nextSibling;
	}

	// Are we finished with the exercise (is the final word correct)?
	var lastWordCorrect = (answer[n-1] === this.lookahead[n-1]);
	var answerLonger = (answer.length > this.lookahead.length);
	if(this.haveFinalWord && (lastWordCorrect || answerLonger)) {
		this.endExercise();
		return;
	}
	
	// Now that we know words are appropriately marked, shift some off
	// the beginning if our input is getting too long.
	var limit = this.ex.inputLength;
	if(limit === undefined) limit = 30;
	if(answerString.length > limit) {
		// Save the old length (so we can tell how much we dropped) and
		// the selection.
		var oldLen = answerString.length;
		var sel = saveSelection(this.ans);
		// Drop words until we're under the limit.
		while(answerString.length > limit) {
			var newAnswer = answerString.replace(/^\s*[\S]+(\s|$)+/, '');
			answerString = newAnswer;
			this.scrollTo = this.scrollTo.nextSibling;
			this.lookahead.shift();
		}
		// Set the new text and restore the (adjusted) selection.
		this.ans.firstChild.nodeValue = answerString;
		var dropped = oldLen - answerString.length;
		sel.start -= dropped;
		sel.end -= dropped;
		restoreSelection(this.ans, sel);
		// Update the output scrolling.
		this.out.scrollTo(this.scrollTo);
	}
}

// Ensure that `words` (and `out`) contain at least `n` words (unless
// we're at the end of the exercise).
TypeJig.prototype.getWords = function(n) {
	if(!this.wordCount) { this.wordCount = 0;  this.charCount = 0; }

	var min_n = this.ex.lookahead || 1;
	if(n === undefined) n = min_n; else n = Math.max(n, min_n);
	n -= this.lookahead.length;
	for(var i=0; i<n; ++i) {
		var word = this.ex.nextWord();
		if(word === false) { this.haveFinalWord = true;  break; }
		this.wordCount++;
		this.charCount += word.length + (this.charCount ? 1 : 0);
		this.lookahead.push(word);
		var text = document.createTextNode(' ' + word);
		var span = document.createElement('span');
		span.appendChild(text);
		this.out.content.appendChild(span);
	}
	if(!this.scrollTo) this.scrollTo = this.out.content.firstChild;
}

// This is only called if the word is marked as an error, so it doesn't
// need to check whether the error is present.
TypeJig.prototype.removeError = function(word, error) {
	this.errorCount--;
}

TypeJig.prototype.addError = function(word, error) {
	this.errorCount++;
	if(this.errors.hasOwnProperty(word)) {
		var e = this.errors[word];
		if(e.indexOf(error) !== -1) e.push(error);
	} else this.errors[word] = [error];
}

TypeJig.prototype.endExercise = function() {
	if(this.running) this.running = false;
	else return;
	this.ans.firstChild.nodeValue = '';
	if(document.activeElement != document.body) document.activeElement.blur();
	this.ans.setAttribute('contenteditable', false);
	this.ans.className = '';

	var seconds = this.clock.stop();
	var minutes = seconds / 60;
	seconds = Math.floor(seconds % 60);
	if(seconds < 10) seconds = '0' + seconds;
	var time = Math.floor(minutes) + ':' + seconds;

	var standardWords = this.charCount / 5;
	var standardWPM = Math.floor(standardWords / minutes);
	var plural = this.errorCount===1 ? '' : 's';
	var accuracy = Math.floor(100 * (1 - this.errorCount / standardWords));
	var correctedWPM = Math.round(standardWPM - (this.errorCount / minutes));
	var results = 'Time: ' + time + ' -  ' + standardWPM + ' WPM (CPM/5)';
	if(this.errorCount === 0) results += ' with no uncorrected errors!';
	else results += ', adjusting for ' + this.errorCount + ' incorrect word' + plural
		+ ' (' + accuracy + '%) gives ' + correctedWPM + ' WPM.'
	this.ans.firstChild.nodeValue = results;
}


/* -----------------------------------------------------------------------
 * ScrollBox - scroll a single line of words to the left.
 *
 * Create a `div` with `overflow: hidden` and put the exercise content
 * in another block-level element inside that.  Below (or above) that,
 * create an input element and give it a large left margin so some of
 * the already-typed exercise text has room to the left.
 *
 * Break your exercise content into spans (with no whitespace in
 * between).  Then call the `scrollTo(element, instantly)` method to
 * scroll the given element so that it lines up with the beginning of
 * the input field.
 */

function ScrollBox(contentElt, secondsTo90Percent, alignToElt) {
	this.content = contentElt;
	if(alignToElt) {
		var style = window.getComputedStyle(alignToElt, null);
		this.offset = parseFloat(style.getPropertyValue('margin-left'));
	} else this.offset = 0;
	this.margin = this.offset;
	this.content.style.marginLeft = this.offset + 'px';
	this.pxPerSec = 0;
	this.k = secondsTo90Percent ? Math.pow(0.1, 1 / secondsTo90Percent) : 0;
	this.removeCount = 0;
	this.removeWidth = 0;

	bindEvent(this.content, 'transitionend', this.endTransition.bind(this));
	bindEvent(alignToElt, 'focus', function(evt) {
		var prompts = this.querySelectorAll('.prompt');
		for(var i=0; i<prompts.length; ++i) this.removeChild(prompts[i]);
	});
}

ScrollBox.prototype.endTransition = function() {
	this.content.style.transition = '';
	if(this.removeCount > 0) {
		do this.content.removeChild(this.content.firstChild);
		while(--this.removeCount > 0);
		this.margin += this.removeWidth;
		this.removeWidth = 0;
		this.content.style.marginLeft = this.margin + 'px';
	}
}

ScrollBox.prototype.scrollTo = function(elt, instantly) {
	var curStyle = window.getComputedStyle(this.content);
	var oldMargin = parseFloat(curStyle.getPropertyValue('margin-left'));
	this.removeCount = 0;
	this.removeWidth = 0;
	this.margin = this.offset;
	if(elt) {
		while((elt = elt.previousSibling)) {
			if(this.margin < 0) {
				this.removeCount++;
				this.removeWidth += elt.offsetWidth;
			}
			this.margin -= elt.offsetWidth;
		}
	}

	// Compute the desired transition rate and smooth it with an
	// IIR low-pass filter.
	var px = this.margin - oldMargin;
	var now = Date.now();
	var sec = this.time ? (now - this.time) / 1000 : 0;
	this.time = now;
	if(sec > 0.001) {
		var pxPerSec = Math.min(px / sec, 0);
		var k = Math.pow(this.k, sec);
		this.pxPerSec = k*this.pxPerSec + (1-k)*pxPerSec;
	}

	// Start the transition.
	if(Math.abs(px) > 0.001) {
		var style = this.content.style;
		if(instantly || Math.abs(this.pxPerSec) < 0.001) style.transition = '';
		else {
			var transitionSec = px / this.pxPerSec;
			style.transition = 'margin-left ' + transitionSec + 's linear';
		}
		style.marginLeft = this.margin + 'px';
	}
}


// -----------------------------------------------------------------------
// Helper functions

isOwnPlural = { 'cod': true };

function pluralize(word) {
	if(isOwnPlural.hasOwnProperty(word)) return word;
	switch(word[word.length-1]) {
		case 's': return word + 'es';
		case 'y': return word.slice(0, -1) + 'ies';
		default: return word + 's';
	}
}

function bindEvent(elt, evt, fn) {
	if(elt.addEventListener) elt.addEventListener(evt, fn, false);
	else if(elt.attachEvent) elt.attachEvent('on'+evt, fn);
}

function scrollOffset(elt) {
	var offset = 0;
	if(elt.offsetParent) do {
		offset += elt.offsetTop;
	} while(elt = elt.offsetParent);
	return offset;
}

function hasClass(elt, className) {
	var re = new RegExp('(\s|^)' + className + '(\s|$)');
	return re.test(elt.className);
}

/**
 * Randomize array element order in-place.
 * Using Durstenfeld shuffle algorithm.
 */
function shuffle(a) {
    for (var i=a.length-1; i>=1; i--) {
        var j = Math.floor(Math.random() * (i+1));
        var a_i=a[i]; a[i]=a[j];  a[j]=a_i;
    }
    return a;
}

function randomIntLessThan(n) { return Math.floor(n * Math.random()) % n; }

function shuffleTail(a, n) {
	n = Math.min(n, a.length);
	var i = n, b = a.length - n;  // current and base indices
	while(--i > 0) {
		var other = randomIntLessThan(i+1);
		var t = a[i+b];  a[i+b] = a[other+b];  a[other+b] = t;
	}
}

function randomize(a) {
	shuffleTail(a, a.length);
	a.randomEltsUsed = 0;
}

// Rotate the first word out to the end of the array.
// If the array has been `randomize`d (has a `used` property defined),
// shuffle the used words when more than 2/3 of them have been used,
// which ensures that the last word can't be shuffled to be the next
// one in the queue.
function rotateAndShuffle(a) {
	if(typeof(a.used) === 'undefined') a.used = 0;

	a.push(a.shift());
	a.used += 1;

	if(typeof(a.randomEltsUsed) === 'undefined') {
		if(a.used >= a.length) return false;
	} else {
		a.randomEltsUsed += 1;
		if(a.randomEltsUsed > 2/3 * a.length) {
			shuffleTail(a, a.randomEltsUsed);
			a.randomEltsUsed = 0;
		}
	}
	return a[0];
}

// http://stackoverflow.com/a/13950376/2426692
var saveSelection, restoreSelection;

if (window.getSelection && document.createRange) {
    saveSelection = function(containerEl) {
        var range = window.getSelection().getRangeAt(0);
        var preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(containerEl);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        var start = preSelectionRange.toString().length;

        return {
            start: start,
            end: start + range.toString().length
        };
    };

    restoreSelection = function(containerEl, savedSel) {
        var charIndex = 0, range = document.createRange();
        range.setStart(containerEl, 0);
        range.collapse(true);
        var nodeStack = [containerEl], node, foundStart = false, stop = false;

        while (!stop && (node = nodeStack.pop())) {
            if (node.nodeType == 3) {
                var nextCharIndex = charIndex + node.length;
                if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
                    range.setStart(node, savedSel.start - charIndex);
                    foundStart = true;
                }
                if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                    range.setEnd(node, savedSel.end - charIndex);
                    stop = true;
                }
                charIndex = nextCharIndex;
            } else {
                var i = node.childNodes.length;
                while (i--) {
                    nodeStack.push(node.childNodes[i]);
                }
            }
        }

        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
} else if (document.selection) {
    saveSelection = function(containerEl) {
        var selectedTextRange = document.selection.createRange();
        var preSelectionTextRange = document.body.createTextRange();
        preSelectionTextRange.moveToElementText(containerEl);
        preSelectionTextRange.setEndPoint("EndToStart", selectedTextRange);
        var start = preSelectionTextRange.text.length;

        return {
            start: start,
            end: start + selectedTextRange.text.length
        }
    };

    restoreSelection = function(containerEl, savedSel) {
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(containerEl);
        textRange.collapse(true);
        textRange.moveEnd("character", savedSel.end);
        textRange.moveStart("character", savedSel.start);
        textRange.select();
    };
}

TypeJig.Timer = function(elt, seconds) {
	this.elt = elt;
	this.setting = seconds || 0;
	this.seconds = this.setting;
	this.fn = this.update.bind(this);
	this.showTime();
}

TypeJig.Timer.prototype.start = function() {
	this.beginning = new Date().getTime();
	if(this.setting > 0) this.end = this.beginning + 1000 * this.setting;
	window.setTimeout(this.fn, 1000);
}

TypeJig.Timer.prototype.stop = function() {
	var elapsed = this.end ? this.setting - this.seconds : this.seconds;
	delete this.beginning;
	delete this.end;
	return elapsed;
}

TypeJig.Timer.prototype.update = function() {
	if(this.beginning) {
		var ms, now = new Date().getTime();
		if(this.end) {
			ms = this.end - now;
			if(ms === 0) delete this.beginning;
		} else ms = now - this.beginning;

		ms = Math.max(ms, 0);
		this.seconds = Math.round(ms/1000);

		this.showTime();
		window.setTimeout(this.fn, ms % 1000);
	}
};

TypeJig.Timer.prototype.showTime = function() {
	var m = Math.floor(this.seconds / 60);
	var s = this.seconds % 60; if(s < 10) s = '0' + s;
	this.elt.innerHTML = m + ':' + s;
}



TypeJig.Exercise = function(words, seconds, shuffle) {
	this.words = words;
	this.seconds = seconds;
	this.shuffle = shuffle;

	if(shuffle) randomize(this.words);

	// FIXME - is words, should be chars like inputLength.
	this.lookahead = 20;
	this.inputLength = 17;
}

TypeJig.Exercise.prototype.nextWord = function() {
	var word = rotateAndShuffle(this.words);
	if(word instanceof Array) {
		return word[randomIntLessThan(word.length)];
	} else return word;
}