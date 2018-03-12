/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule DOMChildrenOperations
 */

'use strict';

var DOMLazyTree = require('DOMLazyTree');
var Danger = require('Danger');
var ReactMultiChildUpdateTypes = require('ReactMultiChildUpdateTypes');
var ReactPerf = require('ReactPerf');

var createMicrosoftUnsafeLocalFunction = require('createMicrosoftUnsafeLocalFunction');
var setInnerHTML = require('setInnerHTML');
var setTextContent = require('setTextContent');

function getNodeAfter(parentNode, node) {
  // Special case for text components, which return [open, close] comments
  // from getNativeNode.
  // 文本返回格式需要注意下，可能会有注释
  if (Array.isArray(node)) {
    node = node[1];
  }
  return node ? node.nextSibling : parentNode.firstChild;
}

/**
 * Inserts `childNode` as a child of `parentNode` at the `index`.
 *
 * @param {DOMElement} parentNode Parent node in which to insert.
 * @param {DOMElement} childNode Child node to insert.
 * @param {number} index Index at which to insert the child.
 * @internal
 */
var insertChildAt = createMicrosoftUnsafeLocalFunction(
  function(parentNode, childNode, referenceNode) {
    // We rely exclusively on `insertBefore(node, null)` instead of also using
    // `appendChild(node)`. (Using `undefined` is not allowed by all browsers so
    // we are careful to use `null`.)
    parentNode.insertBefore(childNode, referenceNode);
  }
);

// 在真实DOM中插入新节点
function insertLazyTreeChildAt(parentNode, childTree, referenceNode) {
  DOMLazyTree.insertTreeBefore(parentNode, childTree, referenceNode);
}

// 在真实DOM中移动节点
function moveChild(parentNode, childNode, referenceNode) {
  if (Array.isArray(childNode)) {
    moveDelimitedText(parentNode, childNode[0], childNode[1], referenceNode);
  } else {
    insertChildAt(parentNode, childNode, referenceNode);
  }
}

// 在真实DOM中移除节点
function removeChild(parentNode, childNode) {
  if (Array.isArray(childNode)) {
    var closingComment = childNode[1];
    childNode = childNode[0];
    removeDelimitedText(parentNode, childNode, closingComment);
    parentNode.removeChild(closingComment);
  }
  parentNode.removeChild(childNode);
}

// 文本组件需要去除openingComment和closeComment，取得其中的节点
function moveDelimitedText(
  parentNode,
  openingComment,
  closingComment,
  referenceNode
) {
  var node = openingComment;
  while (true) {
    var nextNode = node.nextSibling;
    insertChildAt(parentNode, node, referenceNode);
    if (node === closingComment) {
      break;
    }
    node = nextNode;
  }
}

// 文本节点的移除
function removeDelimitedText(parentNode, startNode, closingComment) {
  while (true) {
    var node = startNode.nextSibling;
    if (node === closingComment) {
      // The closing comment is removed by ReactMultiChild.
      break;
    } else {
      parentNode.removeChild(node);
    }
  }
}

// 文本节点的替换
function replaceDelimitedText(openingComment, closingComment, stringText) {
  var parentNode = openingComment.parentNode;
  var nodeAfterComment = openingComment.nextSibling;
  if (nodeAfterComment === closingComment) {
    // There are no text nodes between the opening and closing comments; insert
    // a new one if stringText isn't empty.
    if (stringText) {
      insertChildAt(
        parentNode,
        document.createTextNode(stringText),
        nodeAfterComment
      );
    }
  } else {
    if (stringText) {
      // Set the text content of the first node after the opening comment, and
      // remove all following nodes up until the closing comment.
      setTextContent(nodeAfterComment, stringText);
      removeDelimitedText(parentNode, nodeAfterComment, closingComment);
    } else {
      removeDelimitedText(parentNode, openingComment, closingComment);
    }
  }
}

/**
 * Operations for updating with DOM children.
 */
var DOMChildrenOperations = {

  dangerouslyReplaceNodeWithMarkup: Danger.dangerouslyReplaceNodeWithMarkup,

  replaceDelimitedText: replaceDelimitedText,

  /**
   * Updates a component's children by processing a series of updates. The
   * update configurations are each expected to have a `parentNode` property.
   *
   * @param {array<object>} updates List of update configurations.
   * @internal
   */
  processUpdates: function(parentNode, updates) {
    // 遍历新增的节点，处理更新
    for (var k = 0; k < updates.length; k++) {
      var update = updates[k];
      switch (update.type) { // 判断更新类型
        case ReactMultiChildUpdateTypes.INSERT_MARKUP: // 节点插入
          insertLazyTreeChildAt(
            parentNode,
            update.content,
            getNodeAfter(parentNode, update.afterNode)
          );
          break;
        case ReactMultiChildUpdateTypes.MOVE_EXISTING: // 节点移动
          moveChild(
            parentNode,
            update.fromNode,
            getNodeAfter(parentNode, update.afterNode)
          );
          break;
        case ReactMultiChildUpdateTypes.SET_MARKUP: // 设置节点内容-HTML文本
          setInnerHTML(
            parentNode,
            update.content
          );
          break;
        case ReactMultiChildUpdateTypes.TEXT_CONTENT: // 设置节点内容-Text文本
          setTextContent(
            parentNode,
            update.content
          );
          break;
        case ReactMultiChildUpdateTypes.REMOVE_NODE: // 节点删除
          removeChild(parentNode, update.fromNode);
          break;
      }
    }
  },

};

ReactPerf.measureMethods(DOMChildrenOperations, 'DOMChildrenOperations', {
  replaceDelimitedText: 'replaceDelimitedText',
});

module.exports = DOMChildrenOperations;
