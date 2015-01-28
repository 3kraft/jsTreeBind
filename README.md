# jsTree-bind
A jQuery plugin that allows the use of data binding frameworks (Angular, Ember, Knockout etc.) with the jsTree UI component.

##Rationale

jsTree is a fantastic plugin, but it's a bit behind the times. Unlike when it was first designed, web apps are now based on data binding rather than raw DOM manipulation. However using jsTree with a databinding framework has two main problems:


* jsTree is designed for static data; data that never changes once it's been set.
* You have to mangle your data into [jsTree's specific JSON format](http://www.jstree.com/docs/json/) in order for it to be displayed

My solution to these problems is to use the native capability of every framework; to bind data to the DOM. jsTree-bind uses the DOM as a template from which to create nodes, allowing you to have data in any structure, structure it in any way, but still present it in a tree format using jsTree

##Example
```html
<!--Set the template element to be hidden so it doesn't show up in the DOM-->
<div class="hidden" id="tree-template">
    <div>
        <!--Using a text node to set the text property-->
        People
        <div v-repeat="person: people">
            {{person.name}}

            <!--Using a data-attribute to set the text property-->
            <div data-text="Tags">
                <!--Using a data-attribute to set the icon property-->
                <div data-icon="glyphicon glyphicon-leaf" v-repeat="person.tags">{{$value}}</div>
            </div>

            <div data-text="Friends">

                <!--Using data-jstree to disable the node (the only way to set boolean properties afaik-->
                <div data-jstree='{"disabled": true}' data-icon="glyphicon glyphicon-leaf"
                     v-repeat="friend: person.friends">{{friend.name}}
                </div>
            </div>

            <div data-text="Age">
                <!--Using a data-jstree attribute to set the icon-->
                <div data-jstree='{"icon": "glyphicon glyphicon-leaf"}'>{{person.age}}</div>
            </div>

            <div data-text="Gender">
                <div data-icon="glyphicon glyphicon-leaf">{{person.gender}}</div>
            </div>
        </div>
    </div>
</div>

<!--The element that will recieve the jsTree-->
<div id="js-tree"></div>
```

![Example](http://i.imgur.com/iAgTHX9.png)

##API
