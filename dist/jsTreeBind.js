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
})(this);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvTXV0YXRpb25PYnNlcnZlci5qcyIsInNyYy9XZWFrTWFwLmpzIiwic3JjL2pzVHJlZUJpbmQuanMiLCJzcmMvb2JzZXJ2ZS5qcyIsInNyYy9vcHRpb25zLmpzIiwic3JjL3RyZWVOb2RlLmpzIiwic3JjL3dhcm4uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6ZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24gKGdsb2JhbCkge1xuICAgIHZhciByZWdpc3RyYXRpb25zVGFibGUgPSBuZXcgV2Vha01hcCgpO1xuICAgIHZhciBzZXRJbW1lZGlhdGU7XG4vLyBBcyBtdWNoIGFzIHdlIHdvdWxkIGxpa2UgdG8gdXNlIHRoZSBuYXRpdmUgaW1wbGVtZW50YXRpb24sIElFXG4vLyAoYWxsIHZlcnNpb25zKSBzdWZmZXJzIGEgcmF0aGVyIGFubm95aW5nIGJ1ZyB3aGVyZSBpdCB3aWxsIGRyb3Agb3IgZGVmZXJcbi8vIGNhbGxiYWNrcyB3aGVuIGhlYXZ5IERPTSBvcGVyYXRpb25zIGFyZSBiZWluZyBwZXJmb3JtZWQgY29uY3VycmVudGx5LlxuLy9cbi8vIEZvciBhIHRob3JvdWdoIGRpc2N1c3Npb24gb24gdGhpcywgc2VlOlxuLy8gaHR0cDovL2NvZGVmb3JoaXJlLmNvbS8yMDEzLzA5LzIxL3NldGltbWVkaWF0ZS1hbmQtbWVzc2FnZWNoYW5uZWwtYnJva2VuLW9uLWludGVybmV0LWV4cGxvcmVyLTEwL1xuICAgIGlmICgvVHJpZGVudHxFZGdlLy50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpKSB7XG4vLyBTYWRseSwgdGhpcyBidWcgYWxzbyBhZmZlY3RzIHBvc3RNZXNzYWdlIGFuZCBNZXNzYWdlUXVldWVzLlxuLy9cbi8vIFdlIHdvdWxkIGxpa2UgdG8gdXNlIHRoZSBvbnJlYWR5c3RhdGVjaGFuZ2UgaGFjayBmb3IgSUUgPD0gMTAsIGJ1dCBpdCBpc1xuLy8gZGFuZ2Vyb3VzIGluIHRoZSBwb2x5ZmlsbGVkIGVudmlyb25tZW50IGR1ZSB0byByZXF1aXJpbmcgdGhhdCB0aGVcbi8vIG9ic2VydmVkIHNjcmlwdCBlbGVtZW50IGJlIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgc2V0SW1tZWRpYXRlID0gc2V0VGltZW91dDtcbi8vIElmIHNvbWUgb3RoZXIgYnJvd3NlciBldmVyIGltcGxlbWVudHMgaXQsIGxldCdzIHByZWZlciB0aGVpciBuYXRpdmVcbi8vIGltcGxlbWVudGF0aW9uOlxuICAgIH0gZWxzZSBpZiAod2luZG93LnNldEltbWVkaWF0ZSkge1xuICAgICAgICBzZXRJbW1lZGlhdGUgPSB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuLy8gT3RoZXJ3aXNlLCB3ZSBmYWxsIGJhY2sgdG8gcG9zdE1lc3NhZ2UgYXMgYSBtZWFucyBvZiBlbXVsYXRpbmcgdGhlIG5leHRcbi8vIHRhc2sgc2VtYW50aWNzIG9mIHNldEltbWVkaWF0ZS5cbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgICAgICAgdmFyIHNlbnRpbmVsID0gU3RyaW5nKE1hdGgucmFuZG9tKCkpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBpZiAoZS5kYXRhID09PSBzZW50aW5lbCkge1xuICAgICAgICAgICAgICAgIHZhciBxdWV1ZSA9IHNldEltbWVkaWF0ZVF1ZXVlO1xuICAgICAgICAgICAgICAgIHNldEltbWVkaWF0ZVF1ZXVlID0gW107XG4gICAgICAgICAgICAgICAgcXVldWUuZm9yRWFjaChmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgICAgICAgICBmdW5jKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJbW1lZGlhdGUgPSBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgc2V0SW1tZWRpYXRlUXVldWUucHVzaChmdW5jKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZShzZW50aW5lbCwgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG4vLyBUaGlzIGlzIHVzZWQgdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgc2NoZWR1bGUgMiBjYWxsYXMgdG8gc2V0SW1tZWRpYXRlXG4gICAgdmFyIGlzU2NoZWR1bGVkID0gZmFsc2U7XG4vLyBLZWVwIHRyYWNrIG9mIG9ic2VydmVycyB0aGF0IG5lZWRzIHRvIGJlIG5vdGlmaWVkIG5leHQgdGltZS5cbiAgICB2YXIgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBTY2hlZHVsZXMgfGRpc3BhdGNoQ2FsbGJhY2t8IHRvIGJlIGNhbGxlZCBpbiB0aGUgZnV0dXJlLlxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzY2hlZHVsZUNhbGxiYWNrKG9ic2VydmVyKSB7XG4gICAgICAgIHNjaGVkdWxlZE9ic2VydmVycy5wdXNoKG9ic2VydmVyKTtcbiAgICAgICAgaWYgKCFpc1NjaGVkdWxlZCkge1xuICAgICAgICAgICAgaXNTY2hlZHVsZWQgPSB0cnVlO1xuICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGRpc3BhdGNoQ2FsbGJhY2tzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdyYXBJZk5lZWRlZChub2RlKSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuU2hhZG93RE9NUG9seWZpbGwgJiZcbiAgICAgICAgICAgIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbC53cmFwSWZOZWVkZWQobm9kZSkgfHxcbiAgICAgICAgICAgIG5vZGU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGlzcGF0Y2hDYWxsYmFja3MoKSB7XG4vLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jbXV0YXRpb24tb2JzZXJ2ZXJzXG4gICAgICAgIGlzU2NoZWR1bGVkID0gZmFsc2U7IC8vIFVzZWQgdG8gYWxsb3cgYSBuZXcgc2V0SW1tZWRpYXRlIGNhbGwgYWJvdmUuXG4gICAgICAgIHZhciBvYnNlcnZlcnMgPSBzY2hlZHVsZWRPYnNlcnZlcnM7XG4gICAgICAgIHNjaGVkdWxlZE9ic2VydmVycyA9IFtdO1xuLy8gU29ydCBvYnNlcnZlcnMgYmFzZWQgb24gdGhlaXIgY3JlYXRpb24gVUlEIChpbmNyZW1lbnRhbCkuXG4gICAgICAgIG9ic2VydmVycy5zb3J0KGZ1bmN0aW9uIChvMSwgbzIpIHtcbiAgICAgICAgICAgIHJldHVybiBvMS51aWRfIC0gbzIudWlkXztcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBhbnlOb25FbXB0eSA9IGZhbHNlO1xuICAgICAgICBvYnNlcnZlcnMuZm9yRWFjaChmdW5jdGlvbiAob2JzZXJ2ZXIpIHtcbi8vIDIuMSwgMi4yXG4gICAgICAgICAgICB2YXIgcXVldWUgPSBvYnNlcnZlci50YWtlUmVjb3JkcygpO1xuLy8gMi4zLiBSZW1vdmUgYWxsIHRyYW5zaWVudCByZWdpc3RlcmVkIG9ic2VydmVycyB3aG9zZSBvYnNlcnZlciBpcyBtby5cbiAgICAgICAgICAgIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcik7XG4vLyAyLjRcbiAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5jYWxsYmFja18ocXVldWUsIG9ic2VydmVyKTtcbiAgICAgICAgICAgICAgICBhbnlOb25FbXB0eSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuLy8gMy5cbiAgICAgICAgaWYgKGFueU5vbkVtcHR5KVxuICAgICAgICAgICAgZGlzcGF0Y2hDYWxsYmFja3MoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnNGb3Iob2JzZXJ2ZXIpIHtcbiAgICAgICAgb2JzZXJ2ZXIubm9kZXNfLmZvckVhY2goZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgICAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgICAgICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICByZWdpc3RyYXRpb25zLmZvckVhY2goZnVuY3Rpb24gKHJlZ2lzdHJhdGlvbikge1xuICAgICAgICAgICAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IG9ic2VydmVyKVxuICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGZvciB0aGUgXCJGb3IgZWFjaCByZWdpc3RlcmVkIG9ic2VydmVyIG9ic2VydmVyICh3aXRoXG4gICAgICogb2JzZXJ2ZXIncyBvcHRpb25zIGFzIG9wdGlvbnMpIGluIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMsXG4gICAgICogcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIGFuZCB0aGUgXCJGb3IgZWFjaCBhbmNlc3RvciBhbmNlc3RvciBvZiB0YXJnZXQsIGFuZCBmb3JcbiAgICAgKiBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGggb3B0aW9ucyBvcHRpb25zKSBpbiBhbmNlc3RvcidzIGxpc3RcbiAgICAgKiBvZiByZWdpc3RlcmVkIG9ic2VydmVycywgcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIHBhcnQgb2YgdGhlIGFsZ29yaXRobXMuIFRoZVxuICAgICAqIHxvcHRpb25zLnN1YnRyZWV8IGlzIGNoZWNrZWQgdG8gZW5zdXJlIHRoYXQgdGhlIGNhbGxiYWNrIGlzIGNhbGxlZFxuICAgICAqIGNvcnJlY3RseS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gICAgICogQHBhcmFtIHtmdW5jdGlvbihNdXRhdGlvbk9ic2VydmVySW5pdCk6TXV0YXRpb25SZWNvcmR9IGNhbGxiYWNrXG4gICAgICovXG4gICAgZnVuY3Rpb24gZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgY2FsbGJhY2spIHtcbiAgICAgICAgZm9yICh2YXIgbm9kZSA9IHRhcmdldDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbal07XG4gICAgICAgICAgICAgICAgICAgIHZhciBvcHRpb25zID0gcmVnaXN0cmF0aW9uLm9wdGlvbnM7XG4vLyBPbmx5IHRhcmdldCBpZ25vcmVzIHN1YnRyZWUuXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlICE9PSB0YXJnZXQgJiYgIW9wdGlvbnMuc3VidHJlZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gY2FsbGJhY2sob3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWNvcmQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb24uZW5xdWV1ZShyZWNvcmQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1aWRDb3VudGVyID0gMDtcblxuICAgIC8qKlxuICAgICAqIFRoZSBjbGFzcyB0aGF0IG1hcHMgdG8gdGhlIERPTSBNdXRhdGlvbk9ic2VydmVyIGludGVyZmFjZS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjay5cbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBKc011dGF0aW9uT2JzZXJ2ZXIoY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5jYWxsYmFja18gPSBjYWxsYmFjaztcbiAgICAgICAgdGhpcy5ub2Rlc18gPSBbXTtcbiAgICAgICAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICAgICAgICB0aGlzLnVpZF8gPSArK3VpZENvdW50ZXI7XG4gICAgfVxuXG4gICAgSnNNdXRhdGlvbk9ic2VydmVyLnByb3RvdHlwZSA9IHtcbiAgICAgICAgb2JzZXJ2ZTogZnVuY3Rpb24gKHRhcmdldCwgb3B0aW9ucykge1xuICAgICAgICAgICAgdGFyZ2V0ID0gd3JhcElmTmVlZGVkKHRhcmdldCk7XG4vLyAxLjFcbiAgICAgICAgICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhIHx8XG4vLyAxLjJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZU9sZFZhbHVlICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcbi8vIDEuM1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzIHx8XG4vLyAxLjRcbiAgICAgICAgICAgICAgICBvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQodGFyZ2V0KTtcbiAgICAgICAgICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgICAgICAgICAgICByZWdpc3RyYXRpb25zVGFibGUuc2V0KHRhcmdldCwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcbi8vIDJcbi8vIElmIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMgYWxyZWFkeSBpbmNsdWRlcyBhIHJlZ2lzdGVyZWRcbi8vIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aCB0aGUgY29udGV4dCBvYmplY3QsIHJlcGxhY2UgdGhhdCByZWdpc3RlcmVkXG4vLyBvYnNlcnZlcidzIG9wdGlvbnMgd2l0aCBvcHRpb25zLlxuICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbjtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4vLyAzLlxuLy8gT3RoZXJ3aXNlLCBhZGQgYSBuZXcgcmVnaXN0ZXJlZCBvYnNlcnZlciB0byB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWRcbi8vIG9ic2VydmVycyB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCBhcyB0aGUgb2JzZXJ2ZXIgYW5kIG9wdGlvbnMgYXMgdGhlXG4vLyBvcHRpb25zLCBhbmQgYWRkIHRhcmdldCB0byBjb250ZXh0IG9iamVjdCdzIGxpc3Qgb2Ygbm9kZXMgb24gd2hpY2ggaXRcbi8vIGlzIHJlZ2lzdGVyZWQuXG4gICAgICAgICAgICBpZiAoIXJlZ2lzdHJhdGlvbikge1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbiA9IG5ldyBSZWdpc3RyYXRpb24odGhpcywgdGFyZ2V0LCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICByZWdpc3RyYXRpb25zLnB1c2gocmVnaXN0cmF0aW9uKTtcbiAgICAgICAgICAgICAgICB0aGlzLm5vZGVzXy5wdXNoKHRhcmdldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWdpc3RyYXRpb24uYWRkTGlzdGVuZXJzKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMubm9kZXNfLmZvckVhY2goZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVnaXN0cmF0aW9uLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbi8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLnJlY29yZHNfID0gW107XG4gICAgICAgIH0sXG4gICAgICAgIHRha2VSZWNvcmRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgY29weU9mUmVjb3JkcyA9IHRoaXMucmVjb3Jkc187XG4gICAgICAgICAgICB0aGlzLnJlY29yZHNfID0gW107XG4gICAgICAgICAgICByZXR1cm4gY29weU9mUmVjb3JkcztcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHR5cGVcbiAgICAgKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCkge1xuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xuICAgICAgICB0aGlzLnRhcmdldCA9IHRhcmdldDtcbiAgICAgICAgdGhpcy5hZGRlZE5vZGVzID0gW107XG4gICAgICAgIHRoaXMucmVtb3ZlZE5vZGVzID0gW107XG4gICAgICAgIHRoaXMucHJldmlvdXNTaWJsaW5nID0gbnVsbDtcbiAgICAgICAgdGhpcy5uZXh0U2libGluZyA9IG51bGw7XG4gICAgICAgIHRoaXMuYXR0cmlidXRlTmFtZSA9IG51bGw7XG4gICAgICAgIHRoaXMuYXR0cmlidXRlTmFtZXNwYWNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5vbGRWYWx1ZSA9IG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29weU11dGF0aW9uUmVjb3JkKG9yaWdpbmFsKSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQob3JpZ2luYWwudHlwZSwgb3JpZ2luYWwudGFyZ2V0KTtcbiAgICAgICAgcmVjb3JkLmFkZGVkTm9kZXMgPSBvcmlnaW5hbC5hZGRlZE5vZGVzLnNsaWNlKCk7XG4gICAgICAgIHJlY29yZC5yZW1vdmVkTm9kZXMgPSBvcmlnaW5hbC5yZW1vdmVkTm9kZXMuc2xpY2UoKTtcbiAgICAgICAgcmVjb3JkLnByZXZpb3VzU2libGluZyA9IG9yaWdpbmFsLnByZXZpb3VzU2libGluZztcbiAgICAgICAgcmVjb3JkLm5leHRTaWJsaW5nID0gb3JpZ2luYWwubmV4dFNpYmxpbmc7XG4gICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZTtcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG9yaWdpbmFsLmF0dHJpYnV0ZU5hbWVzcGFjZTtcbiAgICAgICAgcmVjb3JkLm9sZFZhbHVlID0gb3JpZ2luYWwub2xkVmFsdWU7XG4gICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgfTtcbi8vIFdlIGtlZXAgdHJhY2sgb2YgdGhlIHR3byAocG9zc2libHkgb25lKSByZWNvcmRzIHVzZWQgaW4gYSBzaW5nbGUgbXV0YXRpb24uXG4gICAgdmFyIGN1cnJlbnRSZWNvcmQsIHJlY29yZFdpdGhPbGRWYWx1ZTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSByZWNvcmQgd2l0aG91dCB8b2xkVmFsdWV8IGFuZCBjYWNoZXMgaXQgYXMgfGN1cnJlbnRSZWNvcmR8IGZvclxuICAgICAqIGxhdGVyIHVzZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAgICAgKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRSZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gICAgICAgIHJldHVybiBjdXJyZW50UmVjb3JkID0gbmV3IE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyBvciBjcmVhdGVzIGEgcmVjb3JkIHdpdGggfG9sZFZhbHVlfCBiYXNlZCBpbiB0aGUgfGN1cnJlbnRSZWNvcmR8XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG9sZFZhbHVlXG4gICAgICogQHJldHVybiB7TXV0YXRpb25SZWNvcmR9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKSB7XG4gICAgICAgIGlmIChyZWNvcmRXaXRoT2xkVmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuICAgICAgICByZWNvcmRXaXRoT2xkVmFsdWUgPSBjb3B5TXV0YXRpb25SZWNvcmQoY3VycmVudFJlY29yZCk7XG4gICAgICAgIHJlY29yZFdpdGhPbGRWYWx1ZS5vbGRWYWx1ZSA9IG9sZFZhbHVlO1xuICAgICAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsZWFyUmVjb3JkcygpIHtcbiAgICAgICAgY3VycmVudFJlY29yZCA9IHJlY29yZFdpdGhPbGRWYWx1ZSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSByZWNvcmRcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoZSByZWNvcmQgcmVwcmVzZW50cyBhIHJlY29yZCBmcm9tIHRoZSBjdXJyZW50XG4gICAgICogbXV0YXRpb24gZXZlbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gcmVjb3JkUmVwcmVzZW50c0N1cnJlbnRNdXRhdGlvbihyZWNvcmQpIHtcbiAgICAgICAgcmV0dXJuIHJlY29yZCA9PT0gcmVjb3JkV2l0aE9sZFZhbHVlIHx8IHJlY29yZCA9PT0gY3VycmVudFJlY29yZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHdoaWNoIHJlY29yZCwgaWYgYW55LCB0byByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCBpbiB0aGUgcXVldWUuXG4gICAgICogVGhpcyByZXR1cm5zIHxudWxsfCBpZiBubyByZWNvcmQgc2hvdWxkIGJlIHJlcGxhY2VkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbGFzdFJlY29yZFxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IG5ld1JlY29yZFxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9XG4gICAgICovXG4gICAgZnVuY3Rpb24gc2VsZWN0UmVjb3JkKGxhc3RSZWNvcmQsIG5ld1JlY29yZCkge1xuICAgICAgICBpZiAobGFzdFJlY29yZCA9PT0gbmV3UmVjb3JkKVxuICAgICAgICAgICAgcmV0dXJuIGxhc3RSZWNvcmQ7XG4vLyBDaGVjayBpZiB0aGUgdGhlIHJlY29yZCB3ZSBhcmUgYWRkaW5nIHJlcHJlc2VudHMgdGhlIHNhbWUgcmVjb3JkLiBJZlxuLy8gc28sIHdlIGtlZXAgdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZSBpbiBpdC5cbiAgICAgICAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSAmJiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKGxhc3RSZWNvcmQpKVxuICAgICAgICAgICAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xhc3MgdXNlZCB0byByZXByZXNlbnQgYSByZWdpc3RlcmVkIG9ic2VydmVyLlxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAgICAgKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICAgICAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlckluaXR9IG9wdGlvbnNcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBSZWdpc3RyYXRpb24ob2JzZXJ2ZXIsIHRhcmdldCwgb3B0aW9ucykge1xuICAgICAgICB0aGlzLm9ic2VydmVyID0gb2JzZXJ2ZXI7XG4gICAgICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcbiAgICB9XG5cbiAgICBSZWdpc3RyYXRpb24ucHJvdG90eXBlID0ge1xuICAgICAgICBlbnF1ZXVlOiBmdW5jdGlvbiAocmVjb3JkKSB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IHRoaXMub2JzZXJ2ZXIucmVjb3Jkc187XG4gICAgICAgICAgICB2YXIgbGVuZ3RoID0gcmVjb3Jkcy5sZW5ndGg7XG4vLyBUaGVyZSBhcmUgY2FzZXMgd2hlcmUgd2UgcmVwbGFjZSB0aGUgbGFzdCByZWNvcmQgd2l0aCB0aGUgbmV3IHJlY29yZC5cbi8vIEZvciBleGFtcGxlIGlmIHRoZSByZWNvcmQgcmVwcmVzZW50cyB0aGUgc2FtZSBtdXRhdGlvbiB3ZSBuZWVkIHRvIHVzZVxuLy8gdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZS4gSWYgd2UgZ2V0IHNhbWUgcmVjb3JkICh0aGlzIGNhbiBoYXBwZW4gYXMgd2Vcbi8vIHdhbGsgdXAgdGhlIHRyZWUpIHdlIGlnbm9yZSB0aGUgbmV3IHJlY29yZC5cbiAgICAgICAgICAgIGlmIChyZWNvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgbGFzdFJlY29yZCA9IHJlY29yZHNbbGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgdmFyIHJlY29yZFRvUmVwbGFjZUxhc3QgPSBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgcmVjb3JkKTtcbiAgICAgICAgICAgICAgICBpZiAocmVjb3JkVG9SZXBsYWNlTGFzdCkge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmRzW2xlbmd0aCAtIDFdID0gcmVjb3JkVG9SZXBsYWNlTGFzdDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NoZWR1bGVDYWxsYmFjayh0aGlzLm9ic2VydmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlY29yZHNbbGVuZ3RoXSA9IHJlY29yZDtcbiAgICAgICAgfSxcbiAgICAgICAgYWRkTGlzdGVuZXJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmFkZExpc3RlbmVyc18odGhpcy50YXJnZXQpO1xuICAgICAgICB9LFxuICAgICAgICBhZGRMaXN0ZW5lcnNfOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgICAgICAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQXR0ck1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgICAgICAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICAgICAgICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlSW5zZXJ0ZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdCB8fCBvcHRpb25zLnN1YnRyZWUpXG4gICAgICAgICAgICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMsIHRydWUpO1xuICAgICAgICB9LFxuICAgICAgICByZW1vdmVMaXN0ZW5lcnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyc186IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICAgICAgICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICAgICAgICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgICAgICAgICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgICAgICAgICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGRzIGEgdHJhbnNpZW50IG9ic2VydmVyIG9uIG5vZGUuIFRoZSB0cmFuc2llbnQgb2JzZXJ2ZXIgZ2V0cyByZW1vdmVkXG4gICAgICAgICAqIG5leHQgdGltZSB3ZSBkZWxpdmVyIHRoZSBjaGFuZ2UgcmVjb3Jkcy5cbiAgICAgICAgICogQHBhcmFtIHtOb2RlfSBub2RlXG4gICAgICAgICAqL1xuICAgICAgICBhZGRUcmFuc2llbnRPYnNlcnZlcjogZnVuY3Rpb24gKG5vZGUpIHtcbi8vIERvbid0IGFkZCB0cmFuc2llbnQgb2JzZXJ2ZXJzIG9uIHRoZSB0YXJnZXQgaXRzZWxmLiBXZSBhbHJlYWR5IGhhdmUgYWxsXG4vLyB0aGUgcmVxdWlyZWQgbGlzdGVuZXJzIHNldCB1cCBvbiB0aGUgdGFyZ2V0LlxuICAgICAgICAgICAgaWYgKG5vZGUgPT09IHRoaXMudGFyZ2V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMuYWRkTGlzdGVuZXJzXyhub2RlKTtcbiAgICAgICAgICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgICAgICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQobm9kZSwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcbi8vIFdlIGtub3cgdGhhdCByZWdpc3RyYXRpb25zIGRvZXMgbm90IGNvbnRhaW4gdGhpcyBiZWNhdXNlIHdlIGFscmVhZHlcbi8vIGNoZWNrZWQgaWYgbm9kZSA9PT0gdGhpcy50YXJnZXQuXG4gICAgICAgICAgICByZWdpc3RyYXRpb25zLnB1c2godGhpcyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXM7XG4gICAgICAgICAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcbiAgICAgICAgICAgIHRyYW5zaWVudE9ic2VydmVkTm9kZXMuZm9yRWFjaChmdW5jdGlvbiAobm9kZSkge1xuLy8gVHJhbnNpZW50IG9ic2VydmVycyBhcmUgbmV2ZXIgYWRkZWQgdG8gdGhlIHRhcmdldC5cbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyc18obm9kZSk7XG4gICAgICAgICAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVnaXN0cmF0aW9uc1tpXSA9PT0gdGhpcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9ucy5zcGxpY2UoaSwgMSk7XG4vLyBFYWNoIG5vZGUgY2FuIG9ubHkgaGF2ZSBvbmUgcmVnaXN0ZXJlZCBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGhcbi8vIHRoaXMgb2JzZXJ2ZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9LFxuICAgICAgICBoYW5kbGVFdmVudDogZnVuY3Rpb24gKGUpIHtcbi8vIFN0b3AgcHJvcGFnYXRpb24gc2luY2Ugd2UgYXJlIG1hbmFnaW5nIHRoZSBwcm9wYWdhdGlvbiBtYW51YWxseS5cbi8vIFRoaXMgbWVhbnMgdGhhdCBvdGhlciBtdXRhdGlvbiBldmVudHMgb24gdGhlIHBhZ2Ugd2lsbCBub3Qgd29ya1xuLy8gY29ycmVjdGx5IGJ1dCB0aGF0IGlzIGJ5IGRlc2lnbi5cbiAgICAgICAgICAgIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ0RPTUF0dHJNb2RpZmllZCc6XG4vLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1hdHRyaWJ1dGVzXG4gICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gZS5hdHRyTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWVzcGFjZSA9IGUucmVsYXRlZE5vZGUubmFtZXNwYWNlVVJJO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQ7XG4vLyAxLlxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gbmV3IGdldFJlY29yZCgnYXR0cmlidXRlcycsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcbi8vIDIuXG4gICAgICAgICAgICAgICAgICAgIHZhciBvbGRWYWx1ZSA9XG4gICAgICAgICAgICAgICAgICAgICAgICBlLmF0dHJDaGFuZ2UgPT09IE11dGF0aW9uRXZlbnQuQURESVRJT04gPyBudWxsIDogZS5wcmV2VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uIChvcHRpb25zKSB7XG4vLyAzLjEsIDQuMlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuLy8gMy4yLCA0LjNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZUZpbHRlciAmJiBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5sZW5ndGggJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5pbmRleE9mKG5hbWUpID09PSAtMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZXNwYWNlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4vLyAzLjMsIDQuNFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSk7XG4vLyAzLjQsIDQuNVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCc6XG4vLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGFyYWN0ZXJkYXRhXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcbi8vIDEuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmQgPSBnZXRSZWNvcmQoJ2NoYXJhY3RlckRhdGEnLCB0YXJnZXQpO1xuLy8gMi5cbiAgICAgICAgICAgICAgICAgICAgdmFyIG9sZFZhbHVlID0gZS5wcmV2VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uIChvcHRpb25zKSB7XG4vLyAzLjEsIDQuMlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuLy8gMy4yLCA0LjNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcbi8vIDMuMywgNC40XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnRE9NTm9kZVJlbW92ZWQnOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFRyYW5zaWVudE9ic2VydmVyKGUudGFyZ2V0KTtcbi8vIEZhbGwgdGhyb3VnaC5cbiAgICAgICAgICAgICAgICBjYXNlICdET01Ob2RlSW5zZXJ0ZWQnOlxuLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtY2hpbGRsaXN0XG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXQgPSBlLnJlbGF0ZWROb2RlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2hhbmdlZE5vZGUgPSBlLnRhcmdldDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFkZGVkTm9kZXMsIHJlbW92ZWROb2RlcztcbiAgICAgICAgICAgICAgICAgICAgaWYgKGUudHlwZSA9PT0gJ0RPTU5vZGVJbnNlcnRlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZGVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlZE5vZGVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRlZE5vZGVzID0gW107XG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmV2aW91c1NpYmxpbmcgPSBjaGFuZ2VkTm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0U2libGluZyA9IGNoYW5nZWROb2RlLm5leHRTaWJsaW5nO1xuLy8gMS5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hpbGRMaXN0JywgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkLmFkZGVkTm9kZXMgPSBhZGRlZE5vZGVzO1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQucmVtb3ZlZE5vZGVzID0gcmVtb3ZlZE5vZGVzO1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gcHJldmlvdXNTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQubmV4dFNpYmxpbmcgPSBuZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbi8vIDIuMSwgMy4yXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbi8vIDIuMiwgMy4zXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsZWFyUmVjb3JkcygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBnbG9iYWwuSnNNdXRhdGlvbk9ic2VydmVyID0gSnNNdXRhdGlvbk9ic2VydmVyO1xuICAgIGlmICghZ2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIpXG4gICAgICAgIGdsb2JhbC5NdXRhdGlvbk9ic2VydmVyID0gSnNNdXRhdGlvbk9ic2VydmVyO1xufSkodGhpcyk7IiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG5pZiAodHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gICAgICAgIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcbiAgICAgICAgdmFyIFdlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9ICdfX3N0JyArIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKysgKyAnX18nKTtcbiAgICAgICAgfTtcbiAgICAgICAgV2Vha01hcC5wcm90b3R5cGUgPSB7XG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgICAgICAgICAgICAgZW50cnlbMV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlZmluZVByb3BlcnR5KGtleSwgdGhpcy5uYW1lLCB7dmFsdWU6IFtrZXksIHZhbHVlXSwgd3JpdGFibGU6IHRydWV9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHZhciBlbnRyeTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGVudHJ5ID0ga2V5W3RoaXMubmFtZV0pICYmIGVudHJ5WzBdID09PSBrZXkgP1xuICAgICAgICAgICAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWxldGU6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghZW50cnkgfHwgZW50cnlbMF0gIT09IGtleSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaGFzOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVudHJ5WzBdID09PSBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHdpbmRvdy5XZWFrTWFwID0gV2Vha01hcDtcbiAgICB9KSgpO1xufSIsIi8qKlxuICogQ3JlYXRlZCBieSBNaWd1ZWwgb24gMjYvMDEvMjAxNS5cbiAqL1xuKGZ1bmN0aW9uICgkKSB7XG4gICAgdmFyIHdhcm4gPSByZXF1aXJlKFwiLi93YXJuXCIpO1xuICAgIHZhciBnZXREZWZhdWx0cyA9IHJlcXVpcmUoXCIuL29wdGlvbnNcIik7XG4gICAgdmFyIG9ic2VydmUgPSByZXF1aXJlKFwiLi9vYnNlcnZlXCIpO1xuXG4gICAgJC5mbi5qc1RyZWVCaW5kID0gZnVuY3Rpb24gKHRhcmdldCwgb3B0aW9ucykge1xuXG4gICAgICAgIC8vTWFpbiB2YXJpYWJsZXNcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIC8vdGVtcGxhdGUgaXMgdGhlIGVsZW1lbnQgdGhhdCBoYXMgYXNzb2NpYXRlZCBkYXRhIGJpbmRpbmdzIHRoYXQgd2UncmUgYmFzaW5nIHRoZSB0cmVlIG9mZlxuICAgICAgICB2YXIgdGVtcGxhdGUgPSAkKHRhcmdldCk7XG4gICAgICAgIC8vdHJlZSBpcyB0aGUgYWN0dWFsIHRyZWUgZWxlbWVudCB0aGF0ICQoKS5qc3RyZWUgd2lsbCBiZSBjYWxsZWQgb25cbiAgICAgICAgdmFyIHRyZWUgPSB0aGlzO1xuXG4gICAgICAgIC8vUGVyZm9ybSBlcnJvciBjaGVja2luZ1xuICAgICAgICBpZiAodHlwZW9mICQuZm4uanN0cmVlICE9IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImpzVHJlZSBtdXN0IGJlIGluc3RhbGxlZCBmb3IganNUcmVlLWJpbmQgdG8gd29yayFcIik7XG4gICAgICAgIGlmICh0ZW1wbGF0ZVswXSBpbnN0YW5jZW9mIEVsZW1lbnQgPT09IGZhbHNlKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiWW91IG5lZWQgdG8gcGFzcyBpbiBhIHZhbGlkIGpRdWVyeSBzZWxlY3RvciBvciBET00gZWxlbWVudCBhcyB0aGUgZmlyc3QgZWxlbWVudCBvZiBqc1RyZWVCaW5kKClcIik7XG4gICAgICAgIGlmICh0ZW1wbGF0ZS5sZW5ndGggPiAxKVxuICAgICAgICAgICAgd2FybihcIllvdSBjYW4gb25seSBkZWZpbmUgb25lIHJvb3QgZWxlbWVudCB0byBiaW5kIHRvIHRoZSBqc1RyZWUuIEFkZGl0aW9uYWwgZWxlbWVudHMgaWdub3JlZC5cIik7XG5cbiAgICAgICAgLy9NZXJnZSB0aGlzIGNvbmZpZ3VyYXRpb24gb2JqZWN0IHdpdGggd2hhdGV2ZXIgdGhlIHVzZXIgaGFzIHBhc3NlZCBpblxuICAgICAgICB2YXIgbWVyZ2VkID0gJC5leHRlbmQodHJ1ZSwgZ2V0RGVmYXVsdHModGVtcGxhdGUpLCBvcHRpb25zKTtcblxuICAgICAgICAvL0FjdHVhbGx5IGNhbGwganN0cmVlKClcbiAgICAgICAgdHJlZS5qc3RyZWUobWVyZ2VkKTtcblxuICAgICAgICAvL09ic2VydmUgdGhlIHRlbXBsYXRlIGZvciBjaGFuZ2VzXG4gICAgICAgIG9ic2VydmUodGVtcGxhdGVbMF0sIHRyZWUuanN0cmVlKG1lcmdlZCkpO1xuICAgIH07XG59KGpRdWVyeSkpO1xuIiwiLyoqXG4gKiBDcmVhdGVzIGEgbXV0YXRpb24gb2JzZXJ2ZXIgdGhhdCB3aWxsIGF1dG9tYXRpY2FsbHkgcmVmcmVzaCB0aGUganN0cmVlIGlmIGl0IGRldGVjdHMgRE9NIG11dGF0aW9uXG4gKiBAcGFyYW0gaW5zdGFuY2UgVGhlIGpzdHJlZSBpbnN0YW5jZSAoTk9UIGEgRE9NIG9yIGpRdWVyeSBlbGVtZW50KSB0byByZWZyZXNoIGFzIG5lY2Vzc2FyeVxuICogQHJldHVybnMge1dpbmRvdy5NdXRhdGlvbk9ic2VydmVyfVxuICovXG5mdW5jdGlvbiBnZXRPYnNlcnZlcihpbnN0YW5jZSkge1xuICAgIHJldHVybiBuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbiAobXV0YXRpb25zKSB7XG5cbiAgICAgICAgLy9NYXAgdGhlIG11dGF0aW9uIGFycmF5IGludG8gYW4gYXJyYXkgb2YgZGVwdGhzLlxuICAgICAgICAkLmVhY2gobXV0YXRpb25zLCBmdW5jdGlvbiAoaSwgdikge1xuXG4gICAgICAgICAgICAvL09ubHkgaW5jbHVkZSB0aGUgbXV0YXRpb24gaWYgaXQncyBhIG5ldyBub2RlIGFkZGVkXG4gICAgICAgICAgICBpZiAodi5hZGRlZE5vZGVzLmxlbmd0aCA8PSAwKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHQgPSB2LmFkZGVkTm9kZXNbMF0ucGFyZW50Tm9kZTtcbiAgICAgICAgICAgIGluc3RhbmNlLnJlZnJlc2hfbm9kZShcImpzdGJcIiArICQodCkuZGF0YShcImpzdGJcIikpO1xuICAgICAgICB9KTtcblxuICAgIH0pO1xufVxuXG4vKipcbiAqIFRoZSBvYnNlcnZlIG9wdGlvbnMgdG8gcGFzcyBpbnRvIG9ic2VydmUoKVxuICovXG52YXIgb2JzZXJ2ZU9wdGlvbnMgPSB7XG4gICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgY2hhcmFjdGVyRGF0YTogdHJ1ZSxcbiAgICBzdWJ0cmVlOiB0cnVlXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChub2RlLCBqc1RyZWUpIHtcbiAgICBnZXRPYnNlcnZlcihqc1RyZWUpLm9ic2VydmUobm9kZSwgb2JzZXJ2ZU9wdGlvbnMpO1xufTtcbiIsInZhciB0cmVlTm9kZSA9IHJlcXVpcmUoXCIuL3RyZWVOb2RlXCIpO1xuXG4vKipcbiAqIEN1c3RvbSBvcHRpb25zIHRvIGJlIHBhc3NlZCBpbnRvICQoKS5qc1RyZWVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXREZWZhdWx0cyhyb290KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ2NvcmUnOiB7XG4gICAgICAgICAgICBkYXRhOiBmdW5jdGlvbiAob2JqLCBjYWxsYmFjaykge1xuXG4gICAgICAgICAgICAgICAgdmFyIG5vZGVzO1xuXG4gICAgICAgICAgICAgICAgLy9JZiBpdCdzIHRoZSByb290IG5vZGUsIHVzZSB0aGUgdG9wIGxldmVsIG5vZGVzXG4gICAgICAgICAgICAgICAgaWYgKCFvYmoucGFyZW50KVxuICAgICAgICAgICAgICAgICAgICBub2RlcyA9IHJvb3Q7XG4gICAgICAgICAgICAgICAgLy9PdGhlcndpc2UgdXNlIHRoZSBjaGlsZCBub2RlcyBvZiB0aGUgY3VycmVudCBlbGVtZW50XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBub2RlcyA9ICQob2JqLm9yaWdpbmFsLm5vZGUpO1xuXG4gICAgICAgICAgICAgICAgLy9UdXJuIGludG8gYXJyYXkgb2YgY2hpbGRyZW5cbiAgICAgICAgICAgICAgICBub2RlcyA9ICQubWFrZUFycmF5KG5vZGVzLmNoaWxkcmVuKCkpO1xuXG4gICAgICAgICAgICAgICAgLy9Db25zdHJ1Y3QgYSB0cmVlTm9kZSBvdXQgb2YgZWFjaCBlbGVtZW50IGFuZCByZXR1cm4gaXRcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygkLm1hcChub2RlcywgZnVuY3Rpb24gKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgdHJlZU5vZGUoZWwpO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59OyIsIi8qKlxuICogVGhlIElEIHRvIGJlIHVzZWQgYnkgdGhlIG5leHQgY3JlYXRlZCBub2RlXG4gKi9cbnZhciBpZCA9IDA7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB0cmVlIG5vZGUgdG8gYmUgdXNlZCBpbiBqc1RyZWUgYmFzZWQgb24gYSBET00gZWxlbWVudFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyZWVOb2RlKGRvbU5vZGUpIHtcblxuICAgIHZhciBkTm9kZSA9ICQoZG9tTm9kZSk7XG4gICAgdmFyIHROb2RlID0gdGhpcztcblxuICAgIC8vU3RvcmUgdGhlIElEIG9mIHRoZSBjb3JyZXNwb25kaW5nIG5vZGUgaW4gb3VyIHRlbXBsYXRlIG5vZGVcbiAgICBkTm9kZS5kYXRhKFwianN0YlwiLCBpZCk7XG5cbiAgICAvL0RlZmF1bHQgdmFsdWVzXG4gICAgdE5vZGUuY2hpbGRyZW4gPSBCb29sZWFuKGROb2RlLmNoaWxkcmVuKCkubGVuZ3RoKTtcbiAgICB0Tm9kZS5zdGF0ZSA9IHsnb3BlbmVkJzogZmFsc2UsICdzZWxlY3RlZCc6IGZhbHNlfTtcbiAgICB0Tm9kZS5ub2RlID0gZG9tTm9kZTtcbiAgICB0Tm9kZS5pZCA9IFwianN0YlwiICsgaWQrKztcblxuICAgIC8vQWRkIEpTT04gZGF0YSBpZiBwcmVzZW50XG4gICAgdmFyIGV4dHJhSnNvbiA9IGROb2RlLmRhdGEoXCJqc3RyZWVcIik7XG4gICAgaWYgKGV4dHJhSnNvbilcbiAgICAgICAgJC5leHRlbmQodHJ1ZSwgdE5vZGUsIGV4dHJhSnNvbik7XG5cbiAgICAvL0FkZCBhbGwgZGF0YSBhdHRyaWJ1dGVzIGV4Y2VwdCBmb3IgdGhlIGpzdHJlZSBhdHRyaWJ1dGVcbiAgICB2YXIgZXh0cmFBdHRycyA9IGROb2RlLmRhdGEoKTtcbiAgICBkZWxldGUgZXh0cmFBdHRycy5qc3RyZWU7XG4gICAgJC5leHRlbmQodHJ1ZSwgdE5vZGUsIGV4dHJhQXR0cnMpO1xuXG4gICAgLy9QdXQgYWxsIHRoZSBzdGF0ZSB2YXJpYWJsZXMgaW50byB0aGUgc3RhdGUgcHJvcGVydHlcbiAgICAkLmVhY2goW1wib3BlbmVkXCIsIFwic2VsZWN0ZWRcIiwgXCJkaXNhYmxlZFwiXSwgZnVuY3Rpb24gKGluZGV4LCB2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgaW4gdE5vZGUpIHtcbiAgICAgICAgICAgIHROb2RlLnN0YXRlW3ZhbHVlXSA9IHROb2RlW3ZhbHVlXTtcbiAgICAgICAgICAgIGRlbGV0ZSB0Tm9kZVt2YWx1ZV07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vTWFrZSBzdXJlIGl0IGhhcyB0ZXh0IGJ5IGNoZWNraW5nIGZvciB0ZXh0IG5vZGVzXG4gICAgdmFyIHRleHQgPSBcIlwiO1xuICAgIGlmIChcInRleHRcIiBpbiB0aGlzID09PSBmYWxzZSkge1xuICAgICAgICAkLmVhY2goZG9tTm9kZS5jaGlsZE5vZGVzLCBmdW5jdGlvbiAoaW5kZXgsIG5vZGUpIHtcbiAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAzKVxuICAgICAgICAgICAgICAgIHRleHQgKz0gbm9kZS5ub2RlVmFsdWU7XG4gICAgICAgIH0pO1xuICAgICAgICB0Tm9kZS50ZXh0ID0gdGV4dDtcbiAgICB9XG59OyIsIi8qKlxuICogQWxlcnRzIHRoZSB1c2VyIHRvIGFuIGlzc3VlIHdpdGhvdXQgY2F1c2luZyBhbiBlcnJvclxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdhcm4obXNnKSB7XG4gICAgaWYgKGNvbnNvbGUud2FybilcbiAgICAgICAgY29uc29sZS53YXJuKG1zZyk7XG4gICAgZWxzZVxuICAgICAgICBjb25zb2xlLmxvZyhtc2cpO1xufTsiXX0=
