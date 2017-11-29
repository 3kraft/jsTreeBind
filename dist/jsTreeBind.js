(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function (global) {
    var registrationsTable = new WeakMap();
    var setImmediate;
// As much as we would like to use the native implementation, IE
// (all versions) suffers a rather annoying bug where it will drop or defer
// callbacks when heavy DOM operations are being performed concurrently.
//
// For a thorough discussion on this, see:
// http://codeforhire.com/2013/09/21/setimmediate-and-messagechannel-broken-on-internet-explorer-10/
    if (/Trident|Edge/.test(navigator.userAgent)) {
// Sadly, this bug also affects postMessage and MessageQueues.
//
// We would like to use the onreadystatechange hack for IE <= 10, but it is
// dangerous in the polyfilled environment due to requiring that the
// observed script element be in the document.
        setImmediate = setTimeout;
// If some other browser ever implements it, let's prefer their native
// implementation:
    } else if (window.setImmediate) {
        setImmediate = window.setImmediate;
// Otherwise, we fall back to postMessage as a means of emulating the next
// task semantics of setImmediate.
    } else {
        var setImmediateQueue = [];
        var sentinel = String(Math.random());
        window.addEventListener('message', function (e) {
            if (e.data === sentinel) {
                var queue = setImmediateQueue;
                setImmediateQueue = [];
                queue.forEach(function (func) {
                    func();
                });
            }
        });
        setImmediate = function (func) {
            setImmediateQueue.push(func);
            window.postMessage(sentinel, '*');
        };
    }
// This is used to ensure that we never schedule 2 callas to setImmediate
    var isScheduled = false;
// Keep track of observers that needs to be notified next time.
    var scheduledObservers = [];

    /**
     * Schedules |dispatchCallback| to be called in the future.
     * @param {MutationObserver} observer
     */
    function scheduleCallback(observer) {
        scheduledObservers.push(observer);
        if (!isScheduled) {
            isScheduled = true;
            setImmediate(dispatchCallbacks);
        }
    }

    function wrapIfNeeded(node) {
        return window.ShadowDOMPolyfill &&
            window.ShadowDOMPolyfill.wrapIfNeeded(node) ||
            node;
    }

    function dispatchCallbacks() {
// http://dom.spec.whatwg.org/#mutation-observers
        isScheduled = false; // Used to allow a new setImmediate call above.
        var observers = scheduledObservers;
        scheduledObservers = [];
// Sort observers based on their creation UID (incremental).
        observers.sort(function (o1, o2) {
            return o1.uid_ - o2.uid_;
        });
        var anyNonEmpty = false;
        observers.forEach(function (observer) {
// 2.1, 2.2
            var queue = observer.takeRecords();
// 2.3. Remove all transient registered observers whose observer is mo.
            removeTransientObserversFor(observer);
// 2.4
            if (queue.length) {
                observer.callback_(queue, observer);
                anyNonEmpty = true;
            }
        });
// 3.
        if (anyNonEmpty)
            dispatchCallbacks();
    }

    function removeTransientObserversFor(observer) {
        observer.nodes_.forEach(function (node) {
            var registrations = registrationsTable.get(node);
            if (!registrations)
                return;
            registrations.forEach(function (registration) {
                if (registration.observer === observer)
                    registration.removeTransientObservers();
            });
        });
    }

    /**
     * This function is used for the "For each registered observer observer (with
     * observer's options as options) in target's list of registered observers,
     * run these substeps:" and the "For each ancestor ancestor of target, and for
     * each registered observer observer (with options options) in ancestor's list
     * of registered observers, run these substeps:" part of the algorithms. The
     * |options.subtree| is checked to ensure that the callback is called
     * correctly.
     *
     * @param {Node} target
     * @param {function(MutationObserverInit):MutationRecord} callback
     */
    function forEachAncestorAndObserverEnqueueRecord(target, callback) {
        for (var node = target; node; node = node.parentNode) {
            var registrations = registrationsTable.get(node);
            if (registrations) {
                for (var j = 0; j < registrations.length; j++) {
                    var registration = registrations[j];
                    var options = registration.options;
// Only target ignores subtree.
                    if (node !== target && !options.subtree)
                        continue;
                    var record = callback(options);
                    if (record)
                        registration.enqueue(record);
                }
            }
        }
    }

    var uidCounter = 0;

    /**
     * The class that maps to the DOM MutationObserver interface.
     * @param {Function} callback.
     * @constructor
     */
    function JsMutationObserver(callback) {
        this.callback_ = callback;
        this.nodes_ = [];
        this.records_ = [];
        this.uid_ = ++uidCounter;
    }

    JsMutationObserver.prototype = {
        observe: function (target, options) {
            target = wrapIfNeeded(target);
// 1.1
            if (!options.childList && !options.attributes && !options.characterData ||
// 1.2
                options.attributeOldValue && !options.attributes ||
// 1.3
                options.attributeFilter && options.attributeFilter.length && !options.attributes ||
// 1.4
                options.characterDataOldValue && !options.characterData) {
                throw new SyntaxError();
            }
            var registrations = registrationsTable.get(target);
            if (!registrations)
                registrationsTable.set(target, registrations = []);
// 2
// If target's list of registered observers already includes a registered
// observer associated with the context object, replace that registered
// observer's options with options.
            var registration;
            for (var i = 0; i < registrations.length; i++) {
                if (registrations[i].observer === this) {
                    registration = registrations[i];
                    registration.removeListeners();
                    registration.options = options;
                    break;
                }
            }
// 3.
// Otherwise, add a new registered observer to target's list of registered
// observers with the context object as the observer and options as the
// options, and add target to context object's list of nodes on which it
// is registered.
            if (!registration) {
                registration = new Registration(this, target, options);
                registrations.push(registration);
                this.nodes_.push(target);
            }
            registration.addListeners();
        },
        disconnect: function () {
            this.nodes_.forEach(function (node) {
                var registrations = registrationsTable.get(node);
                for (var i = 0; i < registrations.length; i++) {
                    var registration = registrations[i];
                    if (registration.observer === this) {
                        registration.removeListeners();
                        registrations.splice(i, 1);
// Each node can only have one registered observer associated with
// this observer.
                        break;
                    }
                }
            }, this);
            this.records_ = [];
        },
        takeRecords: function () {
            var copyOfRecords = this.records_;
            this.records_ = [];
            return copyOfRecords;
        }
    };
    /**
     * @param {string} type
     * @param {Node} target
     * @constructor
     */
    function MutationRecord(type, target) {
        this.type = type;
        this.target = target;
        this.addedNodes = [];
        this.removedNodes = [];
        this.previousSibling = null;
        this.nextSibling = null;
        this.attributeName = null;
        this.attributeNamespace = null;
        this.oldValue = null;
    }

    function copyMutationRecord(original) {
        var record = new MutationRecord(original.type, original.target);
        record.addedNodes = original.addedNodes.slice();
        record.removedNodes = original.removedNodes.slice();
        record.previousSibling = original.previousSibling;
        record.nextSibling = original.nextSibling;
        record.attributeName = original.attributeName;
        record.attributeNamespace = original.attributeNamespace;
        record.oldValue = original.oldValue;
        return record;
    };
// We keep track of the two (possibly one) records used in a single mutation.
    var currentRecord, recordWithOldValue;

    /**
     * Creates a record without |oldValue| and caches it as |currentRecord| for
     * later use.
     * @param {string} oldValue
     * @return {MutationRecord}
     */
    function getRecord(type, target) {
        return currentRecord = new MutationRecord(type, target);
    }

    /**
     * Gets or creates a record with |oldValue| based in the |currentRecord|
     * @param {string} oldValue
     * @return {MutationRecord}
     */
    function getRecordWithOldValue(oldValue) {
        if (recordWithOldValue)
            return recordWithOldValue;
        recordWithOldValue = copyMutationRecord(currentRecord);
        recordWithOldValue.oldValue = oldValue;
        return recordWithOldValue;
    }

    function clearRecords() {
        currentRecord = recordWithOldValue = undefined;
    }

    /**
     * @param {MutationRecord} record
     * @return {boolean} Whether the record represents a record from the current
     * mutation event.
     */
    function recordRepresentsCurrentMutation(record) {
        return record === recordWithOldValue || record === currentRecord;
    }

    /**
     * Selects which record, if any, to replace the last record in the queue.
     * This returns |null| if no record should be replaced.
     *
     * @param {MutationRecord} lastRecord
     * @param {MutationRecord} newRecord
     * @param {MutationRecord}
     */
    function selectRecord(lastRecord, newRecord) {
        if (lastRecord === newRecord)
            return lastRecord;
// Check if the the record we are adding represents the same record. If
// so, we keep the one with the oldValue in it.
        if (recordWithOldValue && recordRepresentsCurrentMutation(lastRecord))
            return recordWithOldValue;
        return null;
    }

    /**
     * Class used to represent a registered observer.
     * @param {MutationObserver} observer
     * @param {Node} target
     * @param {MutationObserverInit} options
     * @constructor
     */
    function Registration(observer, target, options) {
        this.observer = observer;
        this.target = target;
        this.options = options;
        this.transientObservedNodes = [];
    }

    Registration.prototype = {
        enqueue: function (record) {
            var records = this.observer.records_;
            var length = records.length;
// There are cases where we replace the last record with the new record.
// For example if the record represents the same mutation we need to use
// the one with the oldValue. If we get same record (this can happen as we
// walk up the tree) we ignore the new record.
            if (records.length > 0) {
                var lastRecord = records[length - 1];
                var recordToReplaceLast = selectRecord(lastRecord, record);
                if (recordToReplaceLast) {
                    records[length - 1] = recordToReplaceLast;
                    return;
                }
            } else {
                scheduleCallback(this.observer);
            }
            records[length] = record;
        },
        addListeners: function () {
            this.addListeners_(this.target);
        },
        addListeners_: function (node) {
            var options = this.options;
            if (options.attributes)
                node.addEventListener('DOMAttrModified', this, true);
            if (options.characterData)
                node.addEventListener('DOMCharacterDataModified', this, true);
            if (options.childList)
                node.addEventListener('DOMNodeInserted', this, true);
            if (options.childList || options.subtree)
                node.addEventListener('DOMNodeRemoved', this, true);
        },
        removeListeners: function () {
            this.removeListeners_(this.target);
        },
        removeListeners_: function (node) {
            var options = this.options;
            if (options.attributes)
                node.removeEventListener('DOMAttrModified', this, true);
            if (options.characterData)
                node.removeEventListener('DOMCharacterDataModified', this, true);
            if (options.childList)
                node.removeEventListener('DOMNodeInserted', this, true);
            if (options.childList || options.subtree)
                node.removeEventListener('DOMNodeRemoved', this, true);
        },
        /**
         * Adds a transient observer on node. The transient observer gets removed
         * next time we deliver the change records.
         * @param {Node} node
         */
        addTransientObserver: function (node) {
// Don't add transient observers on the target itself. We already have all
// the required listeners set up on the target.
            if (node === this.target)
                return;
            this.addListeners_(node);
            this.transientObservedNodes.push(node);
            var registrations = registrationsTable.get(node);
            if (!registrations)
                registrationsTable.set(node, registrations = []);
// We know that registrations does not contain this because we already
// checked if node === this.target.
            registrations.push(this);
        },
        removeTransientObservers: function () {
            var transientObservedNodes = this.transientObservedNodes;
            this.transientObservedNodes = [];
            transientObservedNodes.forEach(function (node) {
// Transient observers are never added to the target.
                this.removeListeners_(node);
                var registrations = registrationsTable.get(node);
                for (var i = 0; i < registrations.length; i++) {
                    if (registrations[i] === this) {
                        registrations.splice(i, 1);
// Each node can only have one registered observer associated with
// this observer.
                        break;
                    }
                }
            }, this);
        },
        handleEvent: function (e) {
// Stop propagation since we are managing the propagation manually.
// This means that other mutation events on the page will not work
// correctly but that is by design.
            e.stopImmediatePropagation();
            switch (e.type) {
                case 'DOMAttrModified':
// http://dom.spec.whatwg.org/#concept-mo-queue-attributes
                    var name = e.attrName;
                    var namespace = e.relatedNode.namespaceURI;
                    var target = e.target;
// 1.
                    var record = new getRecord('attributes', target);
                    record.attributeName = name;
                    record.attributeNamespace = namespace;
// 2.
                    var oldValue =
                        e.attrChange === MutationEvent.ADDITION ? null : e.prevValue;
                    forEachAncestorAndObserverEnqueueRecord(target, function (options) {
// 3.1, 4.2
                        if (!options.attributes)
                            return;
// 3.2, 4.3
                        if (options.attributeFilter && options.attributeFilter.length &&
                            options.attributeFilter.indexOf(name) === -1 &&
                            options.attributeFilter.indexOf(namespace) === -1) {
                            return;
                        }
// 3.3, 4.4
                        if (options.attributeOldValue)
                            return getRecordWithOldValue(oldValue);
// 3.4, 4.5
                        return record;
                    });
                    break;
                case 'DOMCharacterDataModified':
// http://dom.spec.whatwg.org/#concept-mo-queue-characterdata
                    var target = e.target;
// 1.
                    var record = getRecord('characterData', target);
// 2.
                    var oldValue = e.prevValue;
                    forEachAncestorAndObserverEnqueueRecord(target, function (options) {
// 3.1, 4.2
                        if (!options.characterData)
                            return;
// 3.2, 4.3
                        if (options.characterDataOldValue)
                            return getRecordWithOldValue(oldValue);
// 3.3, 4.4
                        return record;
                    });
                    break;
                case 'DOMNodeRemoved':
                    this.addTransientObserver(e.target);
// Fall through.
                case 'DOMNodeInserted':
// http://dom.spec.whatwg.org/#concept-mo-queue-childlist
                    var target = e.relatedNode;
                    var changedNode = e.target;
                    var addedNodes, removedNodes;
                    if (e.type === 'DOMNodeInserted') {
                        addedNodes = [changedNode];
                        removedNodes = [];
                    } else {
                        addedNodes = [];
                        removedNodes = [changedNode];
                    }
                    var previousSibling = changedNode.previousSibling;
                    var nextSibling = changedNode.nextSibling;
// 1.
                    var record = getRecord('childList', target);
                    record.addedNodes = addedNodes;
                    record.removedNodes = removedNodes;
                    record.previousSibling = previousSibling;
                    record.nextSibling = nextSibling;
                    forEachAncestorAndObserverEnqueueRecord(target, function (options) {
// 2.1, 3.2
                        if (!options.childList)
                            return;
// 2.2, 3.3
                        return record;
                    });
            }
            clearRecords();
        }
    };
    global.JsMutationObserver = JsMutationObserver;
    if (!global.MutationObserver)
        global.MutationObserver = JsMutationObserver;
})(window);

},{}],2:[function(require,module,exports){
/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
if (typeof WeakMap === 'undefined') {
    (function() {
        var defineProperty = Object.defineProperty;
        var counter = Date.now() % 1e9;
        var WeakMap = function() {
            this.name = '__st' + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
        };
        WeakMap.prototype = {
            set: function(key, value) {
                var entry = key[this.name];
                if (entry && entry[0] === key)
                    entry[1] = value;
                else
                    defineProperty(key, this.name, {value: [key, value], writable: true});
                return this;
            },
            get: function(key) {
                var entry;
                return (entry = key[this.name]) && entry[0] === key ?
                    entry[1] : undefined;
            },
            delete: function(key) {
                var entry = key[this.name];
                if (!entry || entry[0] !== key) return false;
                entry[0] = entry[1] = undefined;
                return true;
            },
            has: function(key) {
                var entry = key[this.name];
                if (!entry) return false;
                return entry[0] === key;
            }
        };
        window.WeakMap = WeakMap;
    })();
}
},{}],3:[function(require,module,exports){
/**
 * Created by Miguel on 26/01/2015.
 */
(function ($) {
    var warn = require("./warn");
    var getDefaults = require("./options");
    var observe = require("./observe");

    $.fn.jsTreeBind = function (target, options) {

        //Main variables
        options = options || {};
        //template is the element that has associated data bindings that we're basing the tree off
        var template = $(target);
        //tree is the actual tree element that $().jstree will be called on
        var tree = this;

        //Perform error checking
        if (typeof $.fn.jstree != "function")
            throw new Error("jsTree must be installed for jsTree-bind to work!");
        if (template[0] instanceof Element === false)
            throw new Error("You need to pass in a valid jQuery selector or DOM element as the first element of jsTreeBind()");
        if (template.length > 1)
            warn("You can only define one root element to bind to the jsTree. Additional elements ignored.");

        //Merge this configuration object with whatever the user has passed in
        var merged = $.extend(true, getDefaults(template), options);

        //Actually call jstree()
        tree.jstree(merged);

        //Observe the template for changes
        observe(template[0], tree.jstree(merged));
    };
}(jQuery));

},{"./observe":4,"./options":5,"./warn":7}],4:[function(require,module,exports){
/**
 * Creates a mutation observer that will automatically refresh the jstree if it detects DOM mutation
 * @param instance The jstree instance (NOT a DOM or jQuery element) to refresh as necessary
 * @returns {Window.MutationObserver}
 */
function getObserver(instance) {
    return new MutationObserver(function (mutations) {

        //Map the mutation array into an array of depths.
        $.each(mutations, function (i, v) {

            //Only include the mutation if it's a new node added
            if (v.addedNodes.length <= 0)
                return;

            var t = v.addedNodes[0].parentNode;
            instance.refresh_node("jstb" + $(t).data("jstb"));
        });

    });
}

/**
 * The observe options to pass into observe()
 */
var observeOptions = {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
};

module.exports = function (node, jsTree) {
    getObserver(jsTree).observe(node, observeOptions);
};

},{}],5:[function(require,module,exports){
var treeNode = require("./treeNode");

/**
 * Custom options to be passed into $().jsTree
 */
module.exports = function getDefaults(root) {
    return {
        'core': {
            data: function (obj, callback) {

                var nodes;

                //If it's the root node, use the top level nodes
                if (!obj.parent)
                    nodes = root;
                //Otherwise use the child nodes of the current element
                else
                    nodes = $(obj.original.node);

                //Turn into array of children
                nodes = $.makeArray(nodes.children());

                //Construct a treeNode out of each element and return it
                callback($.map(nodes, function (el) {
                    return new treeNode(el);
                }));
            }
        }
    };
};
},{"./treeNode":6}],6:[function(require,module,exports){
/**
 * The ID to be used by the next created node
 */
var id = 0;

/**
 * Creates a new tree node to be used in jsTree based on a DOM element
 */
module.exports = function treeNode(domNode) {

    var dNode = $(domNode);
    var tNode = this;

    //Store the ID of the corresponding node in our template node
    dNode.data("jstb", id);

    //Default values
    tNode.children = Boolean(dNode.children().length);
    tNode.state = {'opened': false, 'selected': false};
    tNode.node = domNode;
    tNode.id = "jstb" + id++;

    //Add JSON data if present
    var extraJson = dNode.data("jstree");
    if (extraJson)
        $.extend(true, tNode, extraJson);

    //Add all data attributes except for the jstree attribute
    var extraAttrs = dNode.data();
    delete extraAttrs.jstree;
    $.extend(true, tNode, extraAttrs);

    //Put all the state variables into the state property
    $.each(["opened", "selected", "disabled"], function (index, value) {
        if (value in tNode) {
            tNode.state[value] = tNode[value];
            delete tNode[value];
        }
    });

    //Make sure it has text by checking for text nodes
    var text = "";
    if ("text" in this === false) {
        $.each(domNode.childNodes, function (index, node) {
            if (node.nodeType === 3)
                text += node.nodeValue;
        });
        tNode.text = text;
    }
};
},{}],7:[function(require,module,exports){
/**
 * Alerts the user to an issue without causing an error
 */
module.exports = function warn(msg) {
    if (console.warn)
        console.warn(msg);
    else
        console.log(msg);
};
},{}]},{},[1,2,3])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvTXV0YXRpb25PYnNlcnZlci5qcyIsInNyYy9XZWFrTWFwLmpzIiwic3JjL2pzVHJlZUJpbmQuanMiLCJzcmMvb2JzZXJ2ZS5qcyIsInNyYy9vcHRpb25zLmpzIiwic3JjL3RyZWVOb2RlLmpzIiwic3JjL3dhcm4uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbiAoZ2xvYmFsKSB7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnNUYWJsZSA9IG5ldyBXZWFrTWFwKCk7XG4gICAgdmFyIHNldEltbWVkaWF0ZTtcbi8vIEFzIG11Y2ggYXMgd2Ugd291bGQgbGlrZSB0byB1c2UgdGhlIG5hdGl2ZSBpbXBsZW1lbnRhdGlvbiwgSUVcbi8vIChhbGwgdmVyc2lvbnMpIHN1ZmZlcnMgYSByYXRoZXIgYW5ub3lpbmcgYnVnIHdoZXJlIGl0IHdpbGwgZHJvcCBvciBkZWZlclxuLy8gY2FsbGJhY2tzIHdoZW4gaGVhdnkgRE9NIG9wZXJhdGlvbnMgYXJlIGJlaW5nIHBlcmZvcm1lZCBjb25jdXJyZW50bHkuXG4vL1xuLy8gRm9yIGEgdGhvcm91Z2ggZGlzY3Vzc2lvbiBvbiB0aGlzLCBzZWU6XG4vLyBodHRwOi8vY29kZWZvcmhpcmUuY29tLzIwMTMvMDkvMjEvc2V0aW1tZWRpYXRlLWFuZC1tZXNzYWdlY2hhbm5lbC1icm9rZW4tb24taW50ZXJuZXQtZXhwbG9yZXItMTAvXG4gICAgaWYgKC9UcmlkZW50fEVkZ2UvLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkpIHtcbi8vIFNhZGx5LCB0aGlzIGJ1ZyBhbHNvIGFmZmVjdHMgcG9zdE1lc3NhZ2UgYW5kIE1lc3NhZ2VRdWV1ZXMuXG4vL1xuLy8gV2Ugd291bGQgbGlrZSB0byB1c2UgdGhlIG9ucmVhZHlzdGF0ZWNoYW5nZSBoYWNrIGZvciBJRSA8PSAxMCwgYnV0IGl0IGlzXG4vLyBkYW5nZXJvdXMgaW4gdGhlIHBvbHlmaWxsZWQgZW52aXJvbm1lbnQgZHVlIHRvIHJlcXVpcmluZyB0aGF0IHRoZVxuLy8gb2JzZXJ2ZWQgc2NyaXB0IGVsZW1lbnQgYmUgaW4gdGhlIGRvY3VtZW50LlxuICAgICAgICBzZXRJbW1lZGlhdGUgPSBzZXRUaW1lb3V0O1xuLy8gSWYgc29tZSBvdGhlciBicm93c2VyIGV2ZXIgaW1wbGVtZW50cyBpdCwgbGV0J3MgcHJlZmVyIHRoZWlyIG5hdGl2ZVxuLy8gaW1wbGVtZW50YXRpb246XG4gICAgfSBlbHNlIGlmICh3aW5kb3cuc2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHNldEltbWVkaWF0ZSA9IHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4vLyBPdGhlcndpc2UsIHdlIGZhbGwgYmFjayB0byBwb3N0TWVzc2FnZSBhcyBhIG1lYW5zIG9mIGVtdWxhdGluZyB0aGUgbmV4dFxuLy8gdGFzayBzZW1hbnRpY3Mgb2Ygc2V0SW1tZWRpYXRlLlxuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBzZXRJbW1lZGlhdGVRdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgc2VudGluZWwgPSBTdHJpbmcoTWF0aC5yYW5kb20oKSk7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIGlmIChlLmRhdGEgPT09IHNlbnRpbmVsKSB7XG4gICAgICAgICAgICAgICAgdmFyIHF1ZXVlID0gc2V0SW1tZWRpYXRlUXVldWU7XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgICAgICAgICAgICAgICBxdWV1ZS5mb3JFYWNoKGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmMoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGVRdWV1ZS5wdXNoKGZ1bmMpO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHNlbnRpbmVsLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cbi8vIFRoaXMgaXMgdXNlZCB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciBzY2hlZHVsZSAyIGNhbGxhcyB0byBzZXRJbW1lZGlhdGVcbiAgICB2YXIgaXNTY2hlZHVsZWQgPSBmYWxzZTtcbi8vIEtlZXAgdHJhY2sgb2Ygb2JzZXJ2ZXJzIHRoYXQgbmVlZHMgdG8gYmUgbm90aWZpZWQgbmV4dCB0aW1lLlxuICAgIHZhciBzY2hlZHVsZWRPYnNlcnZlcnMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIFNjaGVkdWxlcyB8ZGlzcGF0Y2hDYWxsYmFja3wgdG8gYmUgY2FsbGVkIGluIHRoZSBmdXR1cmUuXG4gICAgICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNjaGVkdWxlQ2FsbGJhY2sob2JzZXJ2ZXIpIHtcbiAgICAgICAgc2NoZWR1bGVkT2JzZXJ2ZXJzLnB1c2gob2JzZXJ2ZXIpO1xuICAgICAgICBpZiAoIWlzU2NoZWR1bGVkKSB7XG4gICAgICAgICAgICBpc1NjaGVkdWxlZCA9IHRydWU7XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUoZGlzcGF0Y2hDYWxsYmFja3MpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd3JhcElmTmVlZGVkKG5vZGUpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbCAmJlxuICAgICAgICAgICAgd2luZG93LlNoYWRvd0RPTVBvbHlmaWxsLndyYXBJZk5lZWRlZChub2RlKSB8fFxuICAgICAgICAgICAgbm9kZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkaXNwYXRjaENhbGxiYWNrcygpIHtcbi8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNtdXRhdGlvbi1vYnNlcnZlcnNcbiAgICAgICAgaXNTY2hlZHVsZWQgPSBmYWxzZTsgLy8gVXNlZCB0byBhbGxvdyBhIG5ldyBzZXRJbW1lZGlhdGUgY2FsbCBhYm92ZS5cbiAgICAgICAgdmFyIG9ic2VydmVycyA9IHNjaGVkdWxlZE9ic2VydmVycztcbiAgICAgICAgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG4vLyBTb3J0IG9ic2VydmVycyBiYXNlZCBvbiB0aGVpciBjcmVhdGlvbiBVSUQgKGluY3JlbWVudGFsKS5cbiAgICAgICAgb2JzZXJ2ZXJzLnNvcnQoZnVuY3Rpb24gKG8xLCBvMikge1xuICAgICAgICAgICAgcmV0dXJuIG8xLnVpZF8gLSBvMi51aWRfO1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIGFueU5vbkVtcHR5ID0gZmFsc2U7XG4gICAgICAgIG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uIChvYnNlcnZlcikge1xuLy8gMi4xLCAyLjJcbiAgICAgICAgICAgIHZhciBxdWV1ZSA9IG9ic2VydmVyLnRha2VSZWNvcmRzKCk7XG4vLyAyLjMuIFJlbW92ZSBhbGwgdHJhbnNpZW50IHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzIHdob3NlIG9ic2VydmVyIGlzIG1vLlxuICAgICAgICAgICAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzRm9yKG9ic2VydmVyKTtcbi8vIDIuNFxuICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmNhbGxiYWNrXyhxdWV1ZSwgb2JzZXJ2ZXIpO1xuICAgICAgICAgICAgICAgIGFueU5vbkVtcHR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4vLyAzLlxuICAgICAgICBpZiAoYW55Tm9uRW1wdHkpXG4gICAgICAgICAgICBkaXNwYXRjaENhbGxiYWNrcygpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcikge1xuICAgICAgICBvYnNlcnZlci5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgICAgICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuZm9yRWFjaChmdW5jdGlvbiAocmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbi5vYnNlcnZlciA9PT0gb2JzZXJ2ZXIpXG4gICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVUcmFuc2llbnRPYnNlcnZlcnMoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgZm9yIHRoZSBcIkZvciBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGhcbiAgICAgKiBvYnNlcnZlcidzIG9wdGlvbnMgYXMgb3B0aW9ucykgaW4gdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyxcbiAgICAgKiBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgYW5kIHRoZSBcIkZvciBlYWNoIGFuY2VzdG9yIGFuY2VzdG9yIG9mIHRhcmdldCwgYW5kIGZvclxuICAgICAqIGVhY2ggcmVnaXN0ZXJlZCBvYnNlcnZlciBvYnNlcnZlciAod2l0aCBvcHRpb25zIG9wdGlvbnMpIGluIGFuY2VzdG9yJ3MgbGlzdFxuICAgICAqIG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzLCBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgcGFydCBvZiB0aGUgYWxnb3JpdGhtcy4gVGhlXG4gICAgICogfG9wdGlvbnMuc3VidHJlZXwgaXMgY2hlY2tlZCB0byBlbnN1cmUgdGhhdCB0aGUgY2FsbGJhY2sgaXMgY2FsbGVkXG4gICAgICogY29ycmVjdGx5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9uKE11dGF0aW9uT2JzZXJ2ZXJJbml0KTpNdXRhdGlvblJlY29yZH0gY2FsbGJhY2tcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBjYWxsYmFjaykge1xuICAgICAgICBmb3IgKHZhciBub2RlID0gdGFyZ2V0OyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICAgICAgICBpZiAocmVnaXN0cmF0aW9ucykge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSByZWdpc3RyYXRpb24ub3B0aW9ucztcbi8vIE9ubHkgdGFyZ2V0IGlnbm9yZXMgc3VidHJlZS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGUgIT09IHRhcmdldCAmJiAhb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmQgPSBjYWxsYmFjayhvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5lbnF1ZXVlKHJlY29yZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHVpZENvdW50ZXIgPSAwO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGNsYXNzIHRoYXQgbWFwcyB0byB0aGUgRE9NIE11dGF0aW9uT2JzZXJ2ZXIgaW50ZXJmYWNlLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrLlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIEpzTXV0YXRpb25PYnNlcnZlcihjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmNhbGxiYWNrXyA9IGNhbGxiYWNrO1xuICAgICAgICB0aGlzLm5vZGVzXyA9IFtdO1xuICAgICAgICB0aGlzLnJlY29yZHNfID0gW107XG4gICAgICAgIHRoaXMudWlkXyA9ICsrdWlkQ291bnRlcjtcbiAgICB9XG5cbiAgICBKc011dGF0aW9uT2JzZXJ2ZXIucHJvdG90eXBlID0ge1xuICAgICAgICBvYnNlcnZlOiBmdW5jdGlvbiAodGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgICAgICAgICB0YXJnZXQgPSB3cmFwSWZOZWVkZWQodGFyZ2V0KTtcbi8vIDEuMVxuICAgICAgICAgICAgaWYgKCFvcHRpb25zLmNoaWxkTGlzdCAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEgfHxcbi8vIDEuMlxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyB8fFxuLy8gMS4zXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIgJiYgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIubGVuZ3RoICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcbi8vIDEuNFxuICAgICAgICAgICAgICAgIG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldCh0YXJnZXQpO1xuICAgICAgICAgICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQodGFyZ2V0LCByZWdpc3RyYXRpb25zID0gW10pO1xuLy8gMlxuLy8gSWYgdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyBhbHJlYWR5IGluY2x1ZGVzIGEgcmVnaXN0ZXJlZFxuLy8gb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCwgcmVwbGFjZSB0aGF0IHJlZ2lzdGVyZWRcbi8vIG9ic2VydmVyJ3Mgb3B0aW9ucyB3aXRoIG9wdGlvbnMuXG4gICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9uO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbnNbaV0ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb24ub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbi8vIDMuXG4vLyBPdGhlcndpc2UsIGFkZCBhIG5ldyByZWdpc3RlcmVkIG9ic2VydmVyIHRvIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZFxuLy8gb2JzZXJ2ZXJzIHdpdGggdGhlIGNvbnRleHQgb2JqZWN0IGFzIHRoZSBvYnNlcnZlciBhbmQgb3B0aW9ucyBhcyB0aGVcbi8vIG9wdGlvbnMsIGFuZCBhZGQgdGFyZ2V0IHRvIGNvbnRleHQgb2JqZWN0J3MgbGlzdCBvZiBub2RlcyBvbiB3aGljaCBpdFxuLy8gaXMgcmVnaXN0ZXJlZC5cbiAgICAgICAgICAgIGlmICghcmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uID0gbmV3IFJlZ2lzdHJhdGlvbih0aGlzLCB0YXJnZXQsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnMucHVzaChyZWdpc3RyYXRpb24pO1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZXNfLnB1c2godGFyZ2V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5hZGRMaXN0ZW5lcnMoKTtcbiAgICAgICAgfSxcbiAgICAgICAgZGlzY29ubmVjdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICAgICAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuc3BsaWNlKGksIDEpO1xuLy8gRWFjaCBub2RlIGNhbiBvbmx5IGhhdmUgb25lIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoXG4vLyB0aGlzIG9ic2VydmVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgICAgICAgfSxcbiAgICAgICAgdGFrZVJlY29yZHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBjb3B5T2ZSZWNvcmRzID0gdGhpcy5yZWNvcmRzXztcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgICAgICAgICAgIHJldHVybiBjb3B5T2ZSZWNvcmRzO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZVxuICAgICAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XG4gICAgICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICAgICAgICB0aGlzLmFkZGVkTm9kZXMgPSBbXTtcbiAgICAgICAgdGhpcy5yZW1vdmVkTm9kZXMgPSBbXTtcbiAgICAgICAgdGhpcy5wcmV2aW91c1NpYmxpbmcgPSBudWxsO1xuICAgICAgICB0aGlzLm5leHRTaWJsaW5nID0gbnVsbDtcbiAgICAgICAgdGhpcy5hdHRyaWJ1dGVOYW1lID0gbnVsbDtcbiAgICAgICAgdGhpcy5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBudWxsO1xuICAgICAgICB0aGlzLm9sZFZhbHVlID0gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb3B5TXV0YXRpb25SZWNvcmQob3JpZ2luYWwpIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IG5ldyBNdXRhdGlvblJlY29yZChvcmlnaW5hbC50eXBlLCBvcmlnaW5hbC50YXJnZXQpO1xuICAgICAgICByZWNvcmQuYWRkZWROb2RlcyA9IG9yaWdpbmFsLmFkZGVkTm9kZXMuc2xpY2UoKTtcbiAgICAgICAgcmVjb3JkLnJlbW92ZWROb2RlcyA9IG9yaWdpbmFsLnJlbW92ZWROb2Rlcy5zbGljZSgpO1xuICAgICAgICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gb3JpZ2luYWwucHJldmlvdXNTaWJsaW5nO1xuICAgICAgICByZWNvcmQubmV4dFNpYmxpbmcgPSBvcmlnaW5hbC5uZXh0U2libGluZztcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBvcmlnaW5hbC5hdHRyaWJ1dGVOYW1lO1xuICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZXNwYWNlO1xuICAgICAgICByZWNvcmQub2xkVmFsdWUgPSBvcmlnaW5hbC5vbGRWYWx1ZTtcbiAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICB9O1xuLy8gV2Uga2VlcCB0cmFjayBvZiB0aGUgdHdvIChwb3NzaWJseSBvbmUpIHJlY29yZHMgdXNlZCBpbiBhIHNpbmdsZSBtdXRhdGlvbi5cbiAgICB2YXIgY3VycmVudFJlY29yZCwgcmVjb3JkV2l0aE9sZFZhbHVlO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHJlY29yZCB3aXRob3V0IHxvbGRWYWx1ZXwgYW5kIGNhY2hlcyBpdCBhcyB8Y3VycmVudFJlY29yZHwgZm9yXG4gICAgICogbGF0ZXIgdXNlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBvbGRWYWx1ZVxuICAgICAqIEByZXR1cm4ge011dGF0aW9uUmVjb3JkfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldFJlY29yZCh0eXBlLCB0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRSZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIG9yIGNyZWF0ZXMgYSByZWNvcmQgd2l0aCB8b2xkVmFsdWV8IGJhc2VkIGluIHRoZSB8Y3VycmVudFJlY29yZHxcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAgICAgKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpIHtcbiAgICAgICAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG4gICAgICAgIHJlY29yZFdpdGhPbGRWYWx1ZSA9IGNvcHlNdXRhdGlvblJlY29yZChjdXJyZW50UmVjb3JkKTtcbiAgICAgICAgcmVjb3JkV2l0aE9sZFZhbHVlLm9sZFZhbHVlID0gb2xkVmFsdWU7XG4gICAgICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJSZWNvcmRzKCkge1xuICAgICAgICBjdXJyZW50UmVjb3JkID0gcmVjb3JkV2l0aE9sZFZhbHVlID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IHJlY29yZFxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhlIHJlY29yZCByZXByZXNlbnRzIGEgcmVjb3JkIGZyb20gdGhlIGN1cnJlbnRcbiAgICAgKiBtdXRhdGlvbiBldmVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKHJlY29yZCkge1xuICAgICAgICByZXR1cm4gcmVjb3JkID09PSByZWNvcmRXaXRoT2xkVmFsdWUgfHwgcmVjb3JkID09PSBjdXJyZW50UmVjb3JkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgd2hpY2ggcmVjb3JkLCBpZiBhbnksIHRvIHJlcGxhY2UgdGhlIGxhc3QgcmVjb3JkIGluIHRoZSBxdWV1ZS5cbiAgICAgKiBUaGlzIHJldHVybnMgfG51bGx8IGlmIG5vIHJlY29yZCBzaG91bGQgYmUgcmVwbGFjZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSBsYXN0UmVjb3JkXG4gICAgICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbmV3UmVjb3JkXG4gICAgICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgbmV3UmVjb3JkKSB7XG4gICAgICAgIGlmIChsYXN0UmVjb3JkID09PSBuZXdSZWNvcmQpXG4gICAgICAgICAgICByZXR1cm4gbGFzdFJlY29yZDtcbi8vIENoZWNrIGlmIHRoZSB0aGUgcmVjb3JkIHdlIGFyZSBhZGRpbmcgcmVwcmVzZW50cyB0aGUgc2FtZSByZWNvcmQuIElmXG4vLyBzbywgd2Uga2VlcCB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlIGluIGl0LlxuICAgICAgICBpZiAocmVjb3JkV2l0aE9sZFZhbHVlICYmIHJlY29yZFJlcHJlc2VudHNDdXJyZW50TXV0YXRpb24obGFzdFJlY29yZCkpXG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGFzcyB1c2VkIHRvIHJlcHJlc2VudCBhIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIuXG4gICAgICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICAgICAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gICAgICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVySW5pdH0gb3B0aW9uc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFJlZ2lzdHJhdGlvbihvYnNlcnZlciwgdGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMub2JzZXJ2ZXIgPSBvYnNlcnZlcjtcbiAgICAgICAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xuICAgIH1cblxuICAgIFJlZ2lzdHJhdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgICAgIGVucXVldWU6IGZ1bmN0aW9uIChyZWNvcmQpIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gdGhpcy5vYnNlcnZlci5yZWNvcmRzXztcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSByZWNvcmRzLmxlbmd0aDtcbi8vIFRoZXJlIGFyZSBjYXNlcyB3aGVyZSB3ZSByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCB3aXRoIHRoZSBuZXcgcmVjb3JkLlxuLy8gRm9yIGV4YW1wbGUgaWYgdGhlIHJlY29yZCByZXByZXNlbnRzIHRoZSBzYW1lIG11dGF0aW9uIHdlIG5lZWQgdG8gdXNlXG4vLyB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlLiBJZiB3ZSBnZXQgc2FtZSByZWNvcmQgKHRoaXMgY2FuIGhhcHBlbiBhcyB3ZVxuLy8gd2FsayB1cCB0aGUgdHJlZSkgd2UgaWdub3JlIHRoZSBuZXcgcmVjb3JkLlxuICAgICAgICAgICAgaWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHZhciBsYXN0UmVjb3JkID0gcmVjb3Jkc1tsZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkVG9SZXBsYWNlTGFzdCA9IHNlbGVjdFJlY29yZChsYXN0UmVjb3JkLCByZWNvcmQpO1xuICAgICAgICAgICAgICAgIGlmIChyZWNvcmRUb1JlcGxhY2VMYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZHNbbGVuZ3RoIC0gMV0gPSByZWNvcmRUb1JlcGxhY2VMYXN0O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2hlZHVsZUNhbGxiYWNrKHRoaXMub2JzZXJ2ZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVjb3Jkc1tsZW5ndGhdID0gcmVjb3JkO1xuICAgICAgICB9LFxuICAgICAgICBhZGRMaXN0ZW5lcnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZExpc3RlbmVyc186IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICAgICAgICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICAgICAgICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgICAgICAgICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgICAgICAgICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcnNfKHRoaXMudGFyZ2V0KTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXJzXzogZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgICAgICAgICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUF0dHJNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgICAgICAgICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgICAgICAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZUluc2VydGVkJywgdGhpcywgdHJ1ZSk7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QgfHwgb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgICAgICAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgfSxcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZHMgYSB0cmFuc2llbnQgb2JzZXJ2ZXIgb24gbm9kZS4gVGhlIHRyYW5zaWVudCBvYnNlcnZlciBnZXRzIHJlbW92ZWRcbiAgICAgICAgICogbmV4dCB0aW1lIHdlIGRlbGl2ZXIgdGhlIGNoYW5nZSByZWNvcmRzLlxuICAgICAgICAgKiBAcGFyYW0ge05vZGV9IG5vZGVcbiAgICAgICAgICovXG4gICAgICAgIGFkZFRyYW5zaWVudE9ic2VydmVyOiBmdW5jdGlvbiAobm9kZSkge1xuLy8gRG9uJ3QgYWRkIHRyYW5zaWVudCBvYnNlcnZlcnMgb24gdGhlIHRhcmdldCBpdHNlbGYuIFdlIGFscmVhZHkgaGF2ZSBhbGxcbi8vIHRoZSByZXF1aXJlZCBsaXN0ZW5lcnMgc2V0IHVwIG9uIHRoZSB0YXJnZXQuXG4gICAgICAgICAgICBpZiAobm9kZSA9PT0gdGhpcy50YXJnZXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5hZGRMaXN0ZW5lcnNfKG5vZGUpO1xuICAgICAgICAgICAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzLnB1c2gobm9kZSk7XG4gICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICAgICAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uc1RhYmxlLnNldChub2RlLCByZWdpc3RyYXRpb25zID0gW10pO1xuLy8gV2Uga25vdyB0aGF0IHJlZ2lzdHJhdGlvbnMgZG9lcyBub3QgY29udGFpbiB0aGlzIGJlY2F1c2Ugd2UgYWxyZWFkeVxuLy8gY2hlY2tlZCBpZiBub2RlID09PSB0aGlzLnRhcmdldC5cbiAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnMucHVzaCh0aGlzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcztcbiAgICAgICAgICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xuICAgICAgICAgICAgdHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5mb3JFYWNoKGZ1bmN0aW9uIChub2RlKSB7XG4vLyBUcmFuc2llbnQgb2JzZXJ2ZXJzIGFyZSBuZXZlciBhZGRlZCB0byB0aGUgdGFyZ2V0LlxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyhub2RlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldID09PSB0aGlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbi8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH0sXG4gICAgICAgIGhhbmRsZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xuLy8gU3RvcCBwcm9wYWdhdGlvbiBzaW5jZSB3ZSBhcmUgbWFuYWdpbmcgdGhlIHByb3BhZ2F0aW9uIG1hbnVhbGx5LlxuLy8gVGhpcyBtZWFucyB0aGF0IG90aGVyIG11dGF0aW9uIGV2ZW50cyBvbiB0aGUgcGFnZSB3aWxsIG5vdCB3b3JrXG4vLyBjb3JyZWN0bHkgYnV0IHRoYXQgaXMgYnkgZGVzaWduLlxuICAgICAgICAgICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnRE9NQXR0ck1vZGlmaWVkJzpcbi8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWF0dHJpYnV0ZXNcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWUgPSBlLmF0dHJOYW1lO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZXNwYWNlID0gZS5yZWxhdGVkTm9kZS5uYW1lc3BhY2VVUkk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcbi8vIDEuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmQgPSBuZXcgZ2V0UmVjb3JkKCdhdHRyaWJ1dGVzJywgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBuYW1lO1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuLy8gMi5cbiAgICAgICAgICAgICAgICAgICAgdmFyIG9sZFZhbHVlID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGUuYXR0ckNoYW5nZSA9PT0gTXV0YXRpb25FdmVudC5BRERJVElPTiA/IG51bGwgOiBlLnByZXZWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbi8vIDMuMSwgNC4yXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4vLyAzLjIsIDQuM1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZSkgPT09IC0xICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIuaW5kZXhPZihuYW1lc3BhY2UpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbi8vIDMuMywgNC40XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVPbGRWYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcbi8vIDMuNCwgNC41XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJzpcbi8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWNoYXJhY3RlcmRhdGFcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0O1xuLy8gMS5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hhcmFjdGVyRGF0YScsIHRhcmdldCk7XG4vLyAyLlxuICAgICAgICAgICAgICAgICAgICB2YXIgb2xkVmFsdWUgPSBlLnByZXZWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbi8vIDMuMSwgNC4yXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4vLyAzLjIsIDQuM1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpO1xuLy8gMy4zLCA0LjRcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdET01Ob2RlUmVtb3ZlZCc6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkVHJhbnNpZW50T2JzZXJ2ZXIoZS50YXJnZXQpO1xuLy8gRmFsbCB0aHJvdWdoLlxuICAgICAgICAgICAgICAgIGNhc2UgJ0RPTU5vZGVJbnNlcnRlZCc6XG4vLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGlsZGxpc3RcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGUucmVsYXRlZE5vZGU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaGFuZ2VkTm9kZSA9IGUudGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICB2YXIgYWRkZWROb2RlcywgcmVtb3ZlZE5vZGVzO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS50eXBlID09PSAnRE9NTm9kZUluc2VydGVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWRkZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZGVkTm9kZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzU2libGluZyA9IGNoYW5nZWROb2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHRTaWJsaW5nID0gY2hhbmdlZE5vZGUubmV4dFNpYmxpbmc7XG4vLyAxLlxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gZ2V0UmVjb3JkKCdjaGlsZExpc3QnLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQuYWRkZWROb2RlcyA9IGFkZGVkTm9kZXM7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZC5yZW1vdmVkTm9kZXMgPSByZW1vdmVkTm9kZXM7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZC5wcmV2aW91c1NpYmxpbmcgPSBwcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZC5uZXh0U2libGluZyA9IG5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbiAob3B0aW9ucykge1xuLy8gMi4xLCAzLjJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuLy8gMi4yLCAzLjNcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2xlYXJSZWNvcmRzKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGdsb2JhbC5Kc011dGF0aW9uT2JzZXJ2ZXIgPSBKc011dGF0aW9uT2JzZXJ2ZXI7XG4gICAgaWYgKCFnbG9iYWwuTXV0YXRpb25PYnNlcnZlcilcbiAgICAgICAgZ2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIgPSBKc011dGF0aW9uT2JzZXJ2ZXI7XG59KSh3aW5kb3cpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG5pZiAodHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gICAgICAgIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcbiAgICAgICAgdmFyIFdlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9ICdfX3N0JyArIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKysgKyAnX18nKTtcbiAgICAgICAgfTtcbiAgICAgICAgV2Vha01hcC5wcm90b3R5cGUgPSB7XG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgICAgICAgICAgICAgZW50cnlbMV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlZmluZVByb3BlcnR5KGtleSwgdGhpcy5uYW1lLCB7dmFsdWU6IFtrZXksIHZhbHVlXSwgd3JpdGFibGU6IHRydWV9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHZhciBlbnRyeTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGVudHJ5ID0ga2V5W3RoaXMubmFtZV0pICYmIGVudHJ5WzBdID09PSBrZXkgP1xuICAgICAgICAgICAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWxldGU6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghZW50cnkgfHwgZW50cnlbMF0gIT09IGtleSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaGFzOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVudHJ5WzBdID09PSBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHdpbmRvdy5XZWFrTWFwID0gV2Vha01hcDtcbiAgICB9KSgpO1xufSIsIi8qKlxuICogQ3JlYXRlZCBieSBNaWd1ZWwgb24gMjYvMDEvMjAxNS5cbiAqL1xuKGZ1bmN0aW9uICgkKSB7XG4gICAgdmFyIHdhcm4gPSByZXF1aXJlKFwiLi93YXJuXCIpO1xuICAgIHZhciBnZXREZWZhdWx0cyA9IHJlcXVpcmUoXCIuL29wdGlvbnNcIik7XG4gICAgdmFyIG9ic2VydmUgPSByZXF1aXJlKFwiLi9vYnNlcnZlXCIpO1xuXG4gICAgJC5mbi5qc1RyZWVCaW5kID0gZnVuY3Rpb24gKHRhcmdldCwgb3B0aW9ucykge1xuXG4gICAgICAgIC8vTWFpbiB2YXJpYWJsZXNcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIC8vdGVtcGxhdGUgaXMgdGhlIGVsZW1lbnQgdGhhdCBoYXMgYXNzb2NpYXRlZCBkYXRhIGJpbmRpbmdzIHRoYXQgd2UncmUgYmFzaW5nIHRoZSB0cmVlIG9mZlxuICAgICAgICB2YXIgdGVtcGxhdGUgPSAkKHRhcmdldCk7XG4gICAgICAgIC8vdHJlZSBpcyB0aGUgYWN0dWFsIHRyZWUgZWxlbWVudCB0aGF0ICQoKS5qc3RyZWUgd2lsbCBiZSBjYWxsZWQgb25cbiAgICAgICAgdmFyIHRyZWUgPSB0aGlzO1xuXG4gICAgICAgIC8vUGVyZm9ybSBlcnJvciBjaGVja2luZ1xuICAgICAgICBpZiAodHlwZW9mICQuZm4uanN0cmVlICE9IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImpzVHJlZSBtdXN0IGJlIGluc3RhbGxlZCBmb3IganNUcmVlLWJpbmQgdG8gd29yayFcIik7XG4gICAgICAgIGlmICh0ZW1wbGF0ZVswXSBpbnN0YW5jZW9mIEVsZW1lbnQgPT09IGZhbHNlKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiWW91IG5lZWQgdG8gcGFzcyBpbiBhIHZhbGlkIGpRdWVyeSBzZWxlY3RvciBvciBET00gZWxlbWVudCBhcyB0aGUgZmlyc3QgZWxlbWVudCBvZiBqc1RyZWVCaW5kKClcIik7XG4gICAgICAgIGlmICh0ZW1wbGF0ZS5sZW5ndGggPiAxKVxuICAgICAgICAgICAgd2FybihcIllvdSBjYW4gb25seSBkZWZpbmUgb25lIHJvb3QgZWxlbWVudCB0byBiaW5kIHRvIHRoZSBqc1RyZWUuIEFkZGl0aW9uYWwgZWxlbWVudHMgaWdub3JlZC5cIik7XG5cbiAgICAgICAgLy9NZXJnZSB0aGlzIGNvbmZpZ3VyYXRpb24gb2JqZWN0IHdpdGggd2hhdGV2ZXIgdGhlIHVzZXIgaGFzIHBhc3NlZCBpblxuICAgICAgICB2YXIgbWVyZ2VkID0gJC5leHRlbmQodHJ1ZSwgZ2V0RGVmYXVsdHModGVtcGxhdGUpLCBvcHRpb25zKTtcblxuICAgICAgICAvL0FjdHVhbGx5IGNhbGwganN0cmVlKClcbiAgICAgICAgdHJlZS5qc3RyZWUobWVyZ2VkKTtcblxuICAgICAgICAvL09ic2VydmUgdGhlIHRlbXBsYXRlIGZvciBjaGFuZ2VzXG4gICAgICAgIG9ic2VydmUodGVtcGxhdGVbMF0sIHRyZWUuanN0cmVlKG1lcmdlZCkpO1xuICAgIH07XG59KGpRdWVyeSkpO1xuIiwiLyoqXG4gKiBDcmVhdGVzIGEgbXV0YXRpb24gb2JzZXJ2ZXIgdGhhdCB3aWxsIGF1dG9tYXRpY2FsbHkgcmVmcmVzaCB0aGUganN0cmVlIGlmIGl0IGRldGVjdHMgRE9NIG11dGF0aW9uXG4gKiBAcGFyYW0gaW5zdGFuY2UgVGhlIGpzdHJlZSBpbnN0YW5jZSAoTk9UIGEgRE9NIG9yIGpRdWVyeSBlbGVtZW50KSB0byByZWZyZXNoIGFzIG5lY2Vzc2FyeVxuICogQHJldHVybnMge1dpbmRvdy5NdXRhdGlvbk9ic2VydmVyfVxuICovXG5mdW5jdGlvbiBnZXRPYnNlcnZlcihpbnN0YW5jZSkge1xuICAgIHJldHVybiBuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbiAobXV0YXRpb25zKSB7XG5cbiAgICAgICAgLy9NYXAgdGhlIG11dGF0aW9uIGFycmF5IGludG8gYW4gYXJyYXkgb2YgZGVwdGhzLlxuICAgICAgICAkLmVhY2gobXV0YXRpb25zLCBmdW5jdGlvbiAoaSwgdikge1xuXG4gICAgICAgICAgICAvL09ubHkgaW5jbHVkZSB0aGUgbXV0YXRpb24gaWYgaXQncyBhIG5ldyBub2RlIGFkZGVkXG4gICAgICAgICAgICBpZiAodi5hZGRlZE5vZGVzLmxlbmd0aCA8PSAwKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHQgPSB2LmFkZGVkTm9kZXNbMF0ucGFyZW50Tm9kZTtcbiAgICAgICAgICAgIGluc3RhbmNlLnJlZnJlc2hfbm9kZShcImpzdGJcIiArICQodCkuZGF0YShcImpzdGJcIikpO1xuICAgICAgICB9KTtcblxuICAgIH0pO1xufVxuXG4vKipcbiAqIFRoZSBvYnNlcnZlIG9wdGlvbnMgdG8gcGFzcyBpbnRvIG9ic2VydmUoKVxuICovXG52YXIgb2JzZXJ2ZU9wdGlvbnMgPSB7XG4gICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgY2hhcmFjdGVyRGF0YTogdHJ1ZSxcbiAgICBzdWJ0cmVlOiB0cnVlXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChub2RlLCBqc1RyZWUpIHtcbiAgICBnZXRPYnNlcnZlcihqc1RyZWUpLm9ic2VydmUobm9kZSwgb2JzZXJ2ZU9wdGlvbnMpO1xufTtcbiIsInZhciB0cmVlTm9kZSA9IHJlcXVpcmUoXCIuL3RyZWVOb2RlXCIpO1xuXG4vKipcbiAqIEN1c3RvbSBvcHRpb25zIHRvIGJlIHBhc3NlZCBpbnRvICQoKS5qc1RyZWVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXREZWZhdWx0cyhyb290KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ2NvcmUnOiB7XG4gICAgICAgICAgICBkYXRhOiBmdW5jdGlvbiAob2JqLCBjYWxsYmFjaykge1xuXG4gICAgICAgICAgICAgICAgdmFyIG5vZGVzO1xuXG4gICAgICAgICAgICAgICAgLy9JZiBpdCdzIHRoZSByb290IG5vZGUsIHVzZSB0aGUgdG9wIGxldmVsIG5vZGVzXG4gICAgICAgICAgICAgICAgaWYgKCFvYmoucGFyZW50KVxuICAgICAgICAgICAgICAgICAgICBub2RlcyA9IHJvb3Q7XG4gICAgICAgICAgICAgICAgLy9PdGhlcndpc2UgdXNlIHRoZSBjaGlsZCBub2RlcyBvZiB0aGUgY3VycmVudCBlbGVtZW50XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBub2RlcyA9ICQob2JqLm9yaWdpbmFsLm5vZGUpO1xuXG4gICAgICAgICAgICAgICAgLy9UdXJuIGludG8gYXJyYXkgb2YgY2hpbGRyZW5cbiAgICAgICAgICAgICAgICBub2RlcyA9ICQubWFrZUFycmF5KG5vZGVzLmNoaWxkcmVuKCkpO1xuXG4gICAgICAgICAgICAgICAgLy9Db25zdHJ1Y3QgYSB0cmVlTm9kZSBvdXQgb2YgZWFjaCBlbGVtZW50IGFuZCByZXR1cm4gaXRcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygkLm1hcChub2RlcywgZnVuY3Rpb24gKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgdHJlZU5vZGUoZWwpO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59OyIsIi8qKlxuICogVGhlIElEIHRvIGJlIHVzZWQgYnkgdGhlIG5leHQgY3JlYXRlZCBub2RlXG4gKi9cbnZhciBpZCA9IDA7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB0cmVlIG5vZGUgdG8gYmUgdXNlZCBpbiBqc1RyZWUgYmFzZWQgb24gYSBET00gZWxlbWVudFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyZWVOb2RlKGRvbU5vZGUpIHtcblxuICAgIHZhciBkTm9kZSA9ICQoZG9tTm9kZSk7XG4gICAgdmFyIHROb2RlID0gdGhpcztcblxuICAgIC8vU3RvcmUgdGhlIElEIG9mIHRoZSBjb3JyZXNwb25kaW5nIG5vZGUgaW4gb3VyIHRlbXBsYXRlIG5vZGVcbiAgICBkTm9kZS5kYXRhKFwianN0YlwiLCBpZCk7XG5cbiAgICAvL0RlZmF1bHQgdmFsdWVzXG4gICAgdE5vZGUuY2hpbGRyZW4gPSBCb29sZWFuKGROb2RlLmNoaWxkcmVuKCkubGVuZ3RoKTtcbiAgICB0Tm9kZS5zdGF0ZSA9IHsnb3BlbmVkJzogZmFsc2UsICdzZWxlY3RlZCc6IGZhbHNlfTtcbiAgICB0Tm9kZS5ub2RlID0gZG9tTm9kZTtcbiAgICB0Tm9kZS5pZCA9IFwianN0YlwiICsgaWQrKztcblxuICAgIC8vQWRkIEpTT04gZGF0YSBpZiBwcmVzZW50XG4gICAgdmFyIGV4dHJhSnNvbiA9IGROb2RlLmRhdGEoXCJqc3RyZWVcIik7XG4gICAgaWYgKGV4dHJhSnNvbilcbiAgICAgICAgJC5leHRlbmQodHJ1ZSwgdE5vZGUsIGV4dHJhSnNvbik7XG5cbiAgICAvL0FkZCBhbGwgZGF0YSBhdHRyaWJ1dGVzIGV4Y2VwdCBmb3IgdGhlIGpzdHJlZSBhdHRyaWJ1dGVcbiAgICB2YXIgZXh0cmFBdHRycyA9IGROb2RlLmRhdGEoKTtcbiAgICBkZWxldGUgZXh0cmFBdHRycy5qc3RyZWU7XG4gICAgJC5leHRlbmQodHJ1ZSwgdE5vZGUsIGV4dHJhQXR0cnMpO1xuXG4gICAgLy9QdXQgYWxsIHRoZSBzdGF0ZSB2YXJpYWJsZXMgaW50byB0aGUgc3RhdGUgcHJvcGVydHlcbiAgICAkLmVhY2goW1wib3BlbmVkXCIsIFwic2VsZWN0ZWRcIiwgXCJkaXNhYmxlZFwiXSwgZnVuY3Rpb24gKGluZGV4LCB2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgaW4gdE5vZGUpIHtcbiAgICAgICAgICAgIHROb2RlLnN0YXRlW3ZhbHVlXSA9IHROb2RlW3ZhbHVlXTtcbiAgICAgICAgICAgIGRlbGV0ZSB0Tm9kZVt2YWx1ZV07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vTWFrZSBzdXJlIGl0IGhhcyB0ZXh0IGJ5IGNoZWNraW5nIGZvciB0ZXh0IG5vZGVzXG4gICAgdmFyIHRleHQgPSBcIlwiO1xuICAgIGlmIChcInRleHRcIiBpbiB0aGlzID09PSBmYWxzZSkge1xuICAgICAgICAkLmVhY2goZG9tTm9kZS5jaGlsZE5vZGVzLCBmdW5jdGlvbiAoaW5kZXgsIG5vZGUpIHtcbiAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAzKVxuICAgICAgICAgICAgICAgIHRleHQgKz0gbm9kZS5ub2RlVmFsdWU7XG4gICAgICAgIH0pO1xuICAgICAgICB0Tm9kZS50ZXh0ID0gdGV4dDtcbiAgICB9XG59OyIsIi8qKlxuICogQWxlcnRzIHRoZSB1c2VyIHRvIGFuIGlzc3VlIHdpdGhvdXQgY2F1c2luZyBhbiBlcnJvclxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdhcm4obXNnKSB7XG4gICAgaWYgKGNvbnNvbGUud2FybilcbiAgICAgICAgY29uc29sZS53YXJuKG1zZyk7XG4gICAgZWxzZVxuICAgICAgICBjb25zb2xlLmxvZyhtc2cpO1xufTsiXX0=
