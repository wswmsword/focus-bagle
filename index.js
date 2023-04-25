import { objToStr, isObj, getActiveElement, element, tick, isSelectableInput, isEnterEvent, isEscapeEvent, isTabForward, isTabBackward, findLowestCommonAncestorNode } from "./utils";
let isDemo = false;
/** 聚焦，如果是 input，则聚焦后选中 */
const focus = function(e) {
  e.focus();
  if (isSelectableInput(e))
    e.select();
  return true;
};

/** 尝试聚焦，如果聚焦失效，则下个事件循环再次聚焦 */
const tickFocus = function(e) {
  if (e == null) tick(() => e && focus(e));
  else focus(e);
};

/** 手动聚焦下一个元素 */
const focusSubNodesManually = (subNodes, activeIndex, isClamp, handleEsc, isForward, isBackward, onForward, onBackward, coverNode) => e => {
  if (e.target === coverNode) return;
  else e.stopImmediatePropagation(); // 防止封面响应键盘事件
  e.stopImmediatePropagation(); // 防止封面响应键盘事件
  
  const handledEsc = handleEsc(e);
  if (handledEsc) return;

  if ((isForward ?? isTabForward)(e)) {
    onForward?.(e);
    const itemsLen = subNodes.length;
    const nextI = activeIndex + 1;
    activeIndex = isClamp ? Math.min(itemsLen - 1, nextI) : nextI;
    activeIndex %= itemsLen;
    e.preventDefault();
    focus(subNodes[activeIndex]);
  }
  else if ((isBackward ?? isTabBackward)(e)) {
    onBackward?.(e);
    const itemsLen = subNodes.length;
    const nextI = activeIndex - 1;
    activeIndex = isClamp ? Math.max(0, nextI) : nextI;
    activeIndex = (activeIndex + itemsLen) % itemsLen;
    e.preventDefault();
    focus(subNodes[activeIndex]);
  }
};

/** 按下 tab，以浏览器的行为聚焦下个元素 */
const focusSubNodes = (head, tail, isClamp, handleEsc, onForward, onBackward, coverNode) => e => {
  const targ = e.target;
  if (targ === coverNode) return;
  else e.stopImmediatePropagation(); // 防止封面响应键盘事件

  const handledEsc = handleEsc(e);
  if (handledEsc) return;

  if (isTabForward(e)) {
    onForward?.(e);
    if (targ === tail) {
      e.preventDefault();
      if (!isClamp) focus(head);
    }
  }
  else if (isTabBackward(e)) {
    onBackward?.(e);
    if (targ === head) {
      e.preventDefault();
      if (!isClamp) focus(tail);
    }
  }
};

/** 添加焦点需要的事件监听器 */
const addEventListeners = function(rootNode, subNodesHandler, coverNode, coverHandler, coverNext, coverNextHandler, coverPrev, coverPrevHandler, tail, tailHandler, clickRootTailHandler, clickRootExitHandler) {

  // 聚焦根节点的键盘事件，例如 tab 或其它自定义组合键
  rootNode.addEventListener("keydown", subNodesHandler);

  /** 点击退出列表 */
  rootNode.addEventListener("click", clickRootExitHandler);
 
  /** 封面的事件 */
  coverNode?.addEventListener("keydown", coverHandler);

  /** 封面后一个元素的键盘事件 */
  coverNext?.addEventListener("keydown", coverNextHandler);

  /** 封面前一个元素的键盘事件 */
  coverPrev?.addEventListener("keydown", coverPrevHandler);

  if (coverNext == null && coverNode) {

    /** 尾部元素聚焦后的事件，用于返回封面 */
    tail?.addEventListener("focus", tailHandler);

    /** subNodes 点击事件，用于配合 tail focus */
    rootNode.addEventListener("click", clickRootTailHandler);
  }

  return true;
};

/** 获取关键节点 */
const getNodes = function(rootNode, subNodes, coverNode, coverNextNode, coverPrevNode) {
  const _subNodes = subNodes.map(item => element(item)).filter(item => item != null);
  const head = _subNodes[0];
  const tail = _subNodes.slice(-1)[0];
  const _rootNode = element(rootNode) ?? findLowestCommonAncestorNode(head, tail);
  const _coverNode = coverNode === true ? _rootNode : element(coverNode);
  const _coverNextNode = element(coverNextNode);
  const _coverPrevNode = element(coverPrevNode);

  return {
    rootNode: _rootNode,
    subNodes: _subNodes,
    head,
    tail,
    coverNode: _coverNode,
    coverNext: _coverNextNode,
    coverPrev: _coverPrevNode
  };
};

const focusBagel = (...props) => {
  const offset = 0 - (props[0] instanceof Array);
  const rootNode = props[0 + offset];
  const subNodes = props[1 + offset];
  const options  = props[2 + offset] ?? {};
  const {
    /** move: 指定可以聚焦的元素，聚焦 subNodes 内的元素 */
    manual,
    /** move: 是否循环，设置后，尾元素的下个焦点是头元素，头元素的上个焦点是尾元素 */
    loop,
    /** move: 自定义前进焦点函数 */
    forward,
    /** move: 自定义后退焦点函数 */
    backward,
    /** focus/blur: 触发器，如果使用 focusBagel.enter 则不用设置，如果使用 enter.selector 则不用设置 */
    trigger,
    /** focus: 触发触发器的配置 */
    enter = {},
    /** blur: 触发退出触发器的配置 */
    exit = {},
    /** blur: 按下 esc 的行为，如果未设置，则取 exit.on */
    onEscape,
    /** cover: 封面，触发触发器后首先聚焦封面，而不是子元素，可以在封面按下 enter 进入子元素 */
    cover = false,
    /** 延迟挂载非触发器元素的事件，可以是一个返回 promise 的函数，可以是一个接收回调函数的函数 */
    delayToFocus,
    /** 每次触发 exit 是否移除事件 */
    removeListenersEachExit = true,
    /** 用于内部调试 */
    demo = false,
  } = options;
  isDemo = demo;

  const {
    /** 封面节点 */
    node: coverNode,
    /** 封面节点的后一个元素 */
    next: coverNextNode,
    /** 移动至后面元素的自定义组合键 */
    nextKey: coverNextKey,
    /** 从后面节点回到封面节点的组合键 */
    nextKeyBack: coverNextKeyBack,
    /** 移动至后面节点的行为 */
    onNext: onCoverNext,
    /** 从后面回到封面的行为 */
    onNextBack: onCoverNextBack,
    prev: coverPrevNode,
    prevKey: coverPrevKey,
    prevKeyBack: coverPrevKeyBack,
    onPrev: onCoverPrev,
    onPrevBack: onCoverPrevBack,
    enterKey: coverEnterKey,
    onEnter: onEnterCover,
    exitKey: coverExitKey,
    onExit: onExitCover,
  } = isObj(cover) ? cover : { node: !!cover ? (rootNode || true) : null };

  /** 是否已经打开封面选项 */
  const enabledCover = !!coverNode;

  /** 入口们 */
  const enters = [].concat(enter).filter(o => o != null);

  /** 默认入口 */
  let _trigger = element(trigger || enters[0].node);
  // 无 node 则监听 rootNode keydown
  // 有 node 则监听 rootNode click，同时监听 rootNode keydown
  // 有 target 则聚焦 target，无但有封面，则聚焦封面，无封面则聚焦入口
  const escapeExit = objToStr(onEscape) === "[object Function]" ? {
    node: null,
    key: isEscapeEvent,
    on: onEscape,
    target: enabledCover ? coverNode : _trigger,
  } : null;
  const tempExits = [escapeExit].concat(exit).filter(o => o != null);
  const setEscapeExit = tempExits.some(e => e.node == null); // 是否设置了直接按下 esc 的退出
  const exits = setEscapeExit ? tempExits : [{
    ...tempExits[0],
    key: tempExits[0].key ?? isEscapeEvent,
    node: null,
  }].concat(tempExits);

  const {
    key: isForward,
    on: onForward,
  } = isObj(forward) ? forward : { key: forward };

  const {
    key: isBackward,
    on: onBackward,
  } = isObj(backward) ? backward : { key: backward };

  const {
    rootNode: _rootNode,
    subNodes: _subNodes, head, tail,
    coverNode: _coverNode,
    coverNext, coverPrev,
  } = getNodes(rootNode, subNodes, coverNode, coverNextNode, coverPrevNode);

  const isFunctionDelay = objToStr(delayToFocus) === "[object Function]";
  const delayRes = isFunctionDelay && delayToFocus(() => {});
  const promiseDelay = isFunctionDelay && objToStr(delayRes) === "[object Promise]";
  const callbackDelay = isFunctionDelay && !promiseDelay;
  const commonDelay = (
    (head == null || tail == null) ||
    (enabledCover && _coverNode == null)) &&
    !promiseDelay && !callbackDelay;
  const isDelay = promiseDelay || callbackDelay || commonDelay;

  /** 取消循环则设置头和尾焦点 */
  const isClamp = !(loop ?? true);

  // 自定义前进或后退焦点函数，则设置 manual 为 true
  const _manual = !!(isForward || isBackward || manual);

  /** 按下 esc 的反馈，如果未设置，则取触发退出的函数 */
  const _onEscape = onEscape ?? exits[0].on;
  const disabledEsc = _onEscape === false || _onEscape == null;
  /** 按下 esc 是否只聚焦 */
  // const onlyEscapeFocus = _onEscape === true;

  /** 活动元素在 subNodes 中的编号，打开 manual 生效 */
  let activeIndex = 0;

  /** 是否已添加监听事件 */
  let addedListeners = false;

  /** 是否通过 cover 进入的 subNodes */
  let trappedFromCover = false;

  // 入口点击事件
  for (let enter of enters) {
    const { node: origin, on, key } = enter;
    const node = element(origin);
    node?.addEventListener("click", e => enterTriggerHandler(e, on));
    key && node?.addEventListener("keydown", e => {
      if (key(e)) {
        e.preventDefault();
        enterTriggerHandler(e, on);
      }
    });
  }

  // 不用延迟聚焦
  if (!isDelay)
    loadEventListeners(_rootNode, _subNodes, head, tail, _coverNode, coverNext, coverPrev);

  return {
    /** 进入循环，聚焦 */
    enter() {
      _trigger = _trigger || getActiveElement();
      const head = element(subNodes[0]);
      if (head == null)
        console.warn(`没有找到元素 ${subNodes[0]}，如果元素需要等待渲染，您需要延迟调用 enter 等待渲染完毕。`);
      else focus(head);
    },
    /** 退出循环，聚焦触发元素 */
    exit() {
      if (_trigger == null)
        console.warn("未指定触发器，将不会聚焦触发器，您可以在调用 focusBagel 时传入选项 trigger 指定触发器，或者在触发触发器的时候调用函数 enter。");
      else focus(_trigger);
    },
    i: () => activeIndex,
  };

  async function enterTriggerHandler(e, onEnter) {
    onEnter?.(e);

    if (isDelay) {
      if (promiseDelay) {
        await delayToFocus(() => {});
        findNodesToLoadListenersAndFocus();
      }
      else if (callbackDelay) delayToFocus(findNodesToLoadListenersAndFocus);
      else if (commonDelay) findNodesToLoadListenersAndFocus();
    }
    else if (removeListenersEachExit && !addedListeners) {
      loadEventListeners(_rootNode, _subNodes, head, tail, _coverNode, coverNext, coverPrev);
      focusCoverOrHead(_rootNode, head);
    }
    else focusCoverOrHead(_rootNode, head);
  }

  /** 寻找节点，加载事件监听器，聚焦 subNodes 或 coverNode */
  function findNodesToLoadListenersAndFocus() {
    const {
      rootNode: _rootNode,
      subNodes: _subNodes, head, tail,
      coverNode: _coverNode,
      coverNext, coverPrev,
    } = getNodes(rootNode, subNodes, coverNode, coverNextNode, coverPrevNode);

    loadEventListeners(_rootNode, _subNodes, head, tail, _coverNode, coverNext, coverPrev);
    focusCoverOrHead(_coverNode, head);
  }

  function focusCoverOrHead(cover, head) {
    if (enabledCover) tickFocus(cover); // 如果打开封面，首先聚焦封面
    else tickFocus(head); // 如果未打开封面，聚焦内部聚焦列表
  }

  /** 生成事件行为，添加事件监听器 */
  function loadEventListeners(_rootNode, _subNodes, _head, _tail, _coverNode, _coverNext, _coverPrev) {

    if (_rootNode == null)
      throw new Error(`没有找到元素 ${rootNode}，您可以尝试 delayToFocus 选项，等待元素 ${rootNode} 渲染完毕后进行聚焦。`);
    if (_head == null || _tail == null)
      throw new Error("至少需要包含两个可以聚焦的元素，如果元素需要等待渲染，您可以尝试 delayToFocus 选项。");

    // 在焦点循环中触发聚焦
    const subNodesHandler = _manual ?
      focusSubNodesManually(_subNodes, activeIndex, isClamp, exitSubNodesHandler, isForward, isBackward, onForward, onBackward, _coverNode) :
      focusSubNodes(_head, _tail, isClamp, exitSubNodesHandler, onForward, onBackward, _coverNode);

    if (removeListenersEachExit || !addedListeners)
      // 添加除 trigger 以外其它和焦点相关的事件监听器
      addedListeners = addEventListeners(_rootNode, subNodesHandler, _coverNode, coverHandler, _coverNext, coverNextHandler, _coverPrev, coverPrevHandler, _tail, tailHandler, clickRootTailHandler, clickRootExitHandler);

    function clickRootExitHandler(e) {
      for (const exit of exits) {
        const affectedNode = element(exit.node);
        const focusTarget = element(exit.target);
        const on = exit.on;

        if (affectedNode == null) continue;
        if (affectedNode != null && e.target !== affectedNode) continue;
        if (focusTarget) {
          enabledCover && (trappedFromCover = false); // 标记离开列表
          removeListeners();
          (on ?? _onEscape)?.(e);
          return focusTarget && focus(focusTarget);
        } else {
          if (enabledCover) {
            trappedFromCover = false;
            (on ?? _onEscape)?.(e);
            return focus(_coverNode);
          } else {
            removeListeners();
            (on ?? _onEscape)?.(e);
            return _trigger && focus(_trigger);
          }
        }
      }

      return false;
    }

    /** 点击 rootNode 的事件，click 事件响应的顺序在 focus 之后 */
    function clickRootTailHandler(e) {
      const targ = e.target;
      if (getActiveElement() !== _coverNode)
        trappedFromCover = true;

      if (targ === _tail) { // 如果触发了 tail，首先响应 tail 的 focus 事件，封面被聚焦，这里将焦点重新设置到 tail
        focus(_tail);
        trappedFromCover = true;
      }
    }

    /** subNodes 最后一个元素的聚焦事件 */
    function tailHandler(e) {
      const prevFocus = e.relatedTarget; // 理想情况只在 tail 后面一个元素 shift-tab 时触发，可是还存在点击触发的情况，所以需要在点击时调整
      if (prevFocus !== _coverNode && !trappedFromCover) { // subNodes 里聚焦元素同样会聚焦到 tail，这里做区分，如果是从非 subNodes 的范围聚焦这个 tail，就重新聚焦到封面
        focus(_coverNode);
      }
    }

    /** 封面后一个元素的事件响应 */
    function coverNextHandler(e) {
      if (coverNextKeyBack?.(e)) {
        onCoverNextBack?.(e);
        focus(_coverNode);
      }
      else if (isTabBackward(e)) {
        onCoverNextBack?.(e);
        e.preventDefault();
        focus(_coverNode);
      }
    }

    /** 封面前一个元素的事件响应 */
    function coverPrevHandler(e) {
      if (coverPrevKeyBack?.(e)) {
        onCoverPrevBack?.(e);
        focus(_coverNode);
      }
      else if (isTabForward(e)) {
        onCoverPrevBack?.(e);
        e.preventDefault();
        focus(_coverNode);
      }
    }

    /** 封面的键盘事件响应 */
    function coverHandler(e) {
      if (coverNextKey?.(e)) {
        onCoverNext?.(e);
        if (_coverNext == null)
          console.warn("当前没有指定聚焦元素，请指定 cover.next。");
        else focus(_coverNext);
      }
      else if (isTabForward(e)) {
        onCoverNext?.(e);
        if (_coverNext == null) focus(_tail);
        else {
          e.preventDefault();
          focus(_coverNext);
        }
      }
      else if (coverPrevKey?.(e)) {
        onCoverPrev?.(e);
        if (_coverPrev == null)
          console.warn("当前没有指定聚焦元素，请指定 cover.prev。");
        else focus(_coverPrev);
      }
      else if (isTabBackward(e)) {
        onCoverPrev?.(e);
        if (_coverPrev == null)
          focus(_coverNode);
        else {
          e.preventDefault();
          focus(_coverPrev);
        }
      }
      else if((coverEnterKey ?? isEnterEvent)(e)) {
        trappedFromCover = true;
        onEnterCover?.(e);
        focus(_head);
      }
      else if ((coverExitKey ?? isEscapeEvent)(e)) {
        exitCoverHandler(e);
      }
    }

    /** 退出 subNodes 焦点 */
    function exitSubNodesHandler(e) {
      if (disabledEsc) return false;

      for (const exit of exits) {
        const exitKey = exit.key;
        const affectedNode = element(exit.node);
        const focusTarget = element(exit.target);
        const on = exit.on;
        if (affectedNode != null && e.target !== affectedNode) continue;
        if (exitKey?.(e)) {
          if (focusTarget) {
            if (exitKey(e)) {
              enabledCover && (trappedFromCover = false);
              e.preventDefault(); // 阻止 tab 等其它按键的默认行为
              removeListeners();
              (on ?? _onEscape)?.(e);
              return focusTarget && focus(focusTarget);
            }

          } else {
            if (enabledCover) {
              trappedFromCover = false;
              e.preventDefault(); // 阻止 tab 等其它按键的默认行为
              (on ?? _onEscape)?.(e);
              return focus(_coverNode);
            } else {
              removeListeners();
              e.preventDefault(); // 阻止 tab 等其它按键的默认行为
              (on ?? _onEscape)?.(e);
              return _trigger && focus(_trigger);
            }
          }
        }

      }
      return false;
    }

    /** 退出封面焦点的行为 */
    function exitCoverHandler(e) {
      removeListeners();
      onExitCover?.(e);
      return _trigger && focus(_trigger);
    }

    /** 移除监听事件 */
    function removeListeners() {
      addedListeners = false;
      if (removeListenersEachExit) {
        _rootNode.removeEventListener("keydown", subNodesHandler);
        _rootNode.removeEventListener("click", clickRootExitHandler);
        _coverNode?.removeEventListener("keydown", coverHandler);
        _coverNext?.removeEventListener("keydown", coverNextHandler);
        _coverPrev?.removeEventListener("keydown", coverPrevHandler);
        _tail?.removeEventListener("focus", tailHandler);
        _rootNode.removeEventListener("click", clickRootTailHandler);
      }
    }
  }
};

export default focusBagel;