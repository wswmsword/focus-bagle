import { objToStr, isObj, getActiveElement, element, tick, isSelectableInput, isEnterEvent, isEscapeEvent, isTabForward, isTabBackward } from "./utils";

/** 聚焦，如果是 input，则聚焦后选中 */
const focus = function(e) {
  e.focus();
  if (isSelectableInput(e))
    e.select();
  return true;
};

/** 尝试聚焦，如果聚焦失效，则下个事件循环再次聚焦 */
const tryFocus = function(e) {
  if (e == null) tick(() => e && focus(e))
  else focus(e);
};

/** 和封面相关的聚焦行为 */
const focusCover = function(enabledCover, e, container, enterKey, exitKey, onEscape, head, coverNextSibling) {
  const target = e.target;
  if (!enabledCover) return false; // 尚未打开封面选项
  /** 当前事件是否在封面内部 */
  const isInnerCover = target !== container;
  if (isInnerCover) { // 当前聚焦封面内部
    if (exitKey && exitKey(e)) { // 退出封面内部，进入封面
      return focus(container);
    }
    else if (isTabForward(e)) {
      e.preventDefault();
      return focus(coverNextSibling); // 聚焦封面之后一个元素
    }
    else if (isTabBackward(e)) {
      return focus(container);
    }
  } else { // 当前聚焦封面
    if (enterKey && enterKey(e)) { // 进入封面内部
      return focus(head);
    }
    else if (exitKey && exitKey(e)) { // 退出封面，聚焦触发器
      return onEscape(e);
    }
    else if (isTabForward(e)) { // 在封面按下 tab
      e.preventDefault();
      return focus(coverNextSibling); // 聚焦封面之后一个元素
    }
    else if (isEnterEvent(e)) { // 在封面按下 enter
      return focus(head);
    }
  }
  return false;
};

/** 手动聚焦下一个元素 */
const focusNextManually = (subNodes, container, activeIndex, isClamp, enabledCover, onEscape, isForward, isBackward, onForward, onBackward, enterKey, exitKey, coverNextSibling) => e => {

  const focusedCover = focusCover(enabledCover, e, container, enterKey, exitKey, onEscape, subNodes[0], coverNextSibling);
  if (focusedCover) return;

  if ((exitKey ?? isEscapeEvent)(e)) {
    onEscape();
    return;
  }

  if ((isForward ?? isTabForward)(e)) {
    onForward && onForward(e);
    const itemsLen = subNodes.length;
    const nextI = activeIndex + 1;
    activeIndex = isClamp ? Math.min(itemsLen - 1, nextI) : nextI;
    activeIndex %= itemsLen;
    e.preventDefault();
    focus(subNodes[activeIndex]);
  }
  else if ((isBackward ?? isTabBackward)(e)) {
    onBackward && onBackward(e);
    const itemsLen = subNodes.length;
    const nextI = activeIndex - 1;
    activeIndex = isClamp ? Math.max(0, nextI) : nextI;
    activeIndex = (activeIndex + itemsLen) % itemsLen;
    e.preventDefault();
    focus(subNodes[activeIndex]);
  }
};

/** 按下 tab，自动聚焦下个元素 */
const focusNextKey = (head, tail, container, isClamp, enabledCover, onEscape, onForward, onBackward, enterKey, exitKey, coverNextSibling) => e => {
  const targ = e.target;

  const focusedCover = focusCover(enabledCover, e, container, enterKey, exitKey, onEscape, head, coverNextSibling);
  if (focusedCover) return;

  if ((exitKey ?? isEscapeEvent)(e)) { // 聚焦触发器
    onEscape();
    return;
  }

  if (isTabForward(e)) {
    onForward && onForward(e);
    if (targ === tail) {
      e.preventDefault();
      if (!isClamp) focus(head);
    }
  }
  else if (isTabBackward(e)) {
    onBackward && onBackward(e);
    if (targ === head) {
      e.preventDefault();
      if (!isClamp) focus(tail);
    }
  }
};

/** 在遮罩的后一个元素按下 shift-tab */
const handleCoverShiftTab = container => e => {
  if (isTabBackward(e)) {
    e.preventDefault();
    focus(container);
  }
};

/** 添加焦点需要的事件监听器 */
const addEventListeners = function(rootNode, handleFocus, exitNode, exitHandler, coverNextSibling, coverShiftTabHandler) {

  // 聚焦根节点的键盘事件，例如 tab 或其它自定义组合键
  rootNode.addEventListener("keydown", handleFocus);

  // 封面的后一个元素，接收 shift-tab 时的行为
  coverNextSibling?.addEventListener("keydown", coverShiftTabHandler);

  // 跳出循环的触发器的点击事件
  exitNode?.addEventListener("click", exitHandler);

  return true;
};

/** 获取关键节点 */
const getNodes = function(rootNode, subNodes, exitNode) {
  const _rootNode = element(rootNode);
  const _subNodes = subNodes.map(item => {
    let _item = element(item);
    // if (_item == null) console.warn(`没有找到元素 ${item}。`);
    return _item;
  }).filter(item => item != null);
  const head = _subNodes[0];
  const tail = _subNodes.slice(-1)[0];
  const _exitNode = element(exitNode);

  // if (head == null || tail == null)
  //   throw("至少需要包含两个可以聚焦的元素。");
  return {
    rootNode: _rootNode,
    subNodes: _subNodes,
    head,
    tail,
    exitNode: _exitNode,
  };
};

const focusBagel = (rootNode, subNodes, options = {}) => {

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
    /** cover: 封面，触发触发器后首先聚焦封面，而不是子元素，可以在封面按下 enter 进入子元素
     * TODO: cover 配置选项，例如是否锁 tab（默认不锁）
     */
    cover = false,
    /** 延迟挂载非触发器元素的事件，可以是一个返回 promise 的函数，可以是一个接收回调函数的函数 */
    delayToFocus,
    /** 每次触发 exit 是否移除事件 */
    removeListenersEachExit = true,
    /** TODO: 子元素锁 tab */
  } = options;

  const {
    node: enterStringOrElement,
    on: onEnter,
    key: enterKey,
  } = enter;
  const {
    node: exitStringOrElement,
    on: onExit,
    key: exitKey,
  } = exit;

  const isObjForward = isObj(forward);
  const isObjBackward = isObj(backward);

  const {
    key: isForward,
    on: onForward,
  } = isObjForward ? forward : { key: forward };

  const {
    key: isBackward,
    on: onBackward,
  } = isObjBackward ? backward : { key: backward };

  /** 封面选项是否为对象 */
  const isObjCover = isObj(cover);
  const {
    nextSibling: coverNextSibling
  } = isObjCover ? cover : {};

  const { rootNode: _rootNode, subNodes: _subNodes, head, tail } = getNodes(rootNode, subNodes);

  const isFunctionDelay = objToStr(delayToFocus) === "[object Function]";
  const delayRes = isFunctionDelay && delayToFocus(() => {});
  const promiseDelay = isFunctionDelay && objToStr(delayRes) === "[object Promise]";
  const callbackDelay = isFunctionDelay && !promiseDelay;
  const commonDelay = (_rootNode == null || head == null || tail == null) && !promiseDelay && !callbackDelay;
  const isDelay = promiseDelay || callbackDelay || commonDelay;

  /** 是否已经打开封面选项 */
  const enabledCover = isObjCover || cover === true;

  /** 取消循环则设置头和尾焦点 */
  const isClamp = !(loop ?? true);

  // 自定义前进或后退焦点函数，则设置 manual 为 true
  const _manual = !!(isForward || isBackward || manual);

  /** 按下 esc 的反馈，如果未设置，则取触发退出的函数 */
  const _onEscape = onEscape ?? onExit;
  const disabledEsc = _onEscape === false || _onEscape == null;

  /** 触发打开焦点的元素 */
  let _trigger = element(trigger || enterStringOrElement);

  /** 活动元素在 subNodes 中的编号，打开 manual 生效 */
  let activeIndex = 0;

  let addedListeners = false;

  // 触发器点击事件
  if (_trigger) {
    _trigger.addEventListener("click", async e => {
      const focusNext = function(rootNode, head) {
        if (enabledCover) tryFocus(rootNode); // 如果打开封面，首先聚焦封面
        else tryFocus(head); // 如果未打开封面，聚焦内部聚焦列表
      };
      onEnter && onEnter(e);

      if (isDelay) {
        if (promiseDelay) {
          await delayToFocus(() => {});
          const { rootNode: _, head } = loadEventListeners(rootNode, subNodes);
          focusNext(_, head);
        }
        else if (callbackDelay) {
          delayToFocus(() => {
            const { rootNode: _, head } = loadEventListeners(rootNode, subNodes);
            focusNext(_, head);
          });
        }
        else if (commonDelay) {
          const { rootNode: _, head } = loadEventListeners(rootNode, subNodes);
          focusNext(_, head);
        }
      }
      else if (removeListenersEachExit) {
        loadEventListeners(_rootNode, _subNodes)
        focusNext(_rootNode, head);
      }
      else focusNext(_rootNode, head);
    });
  }

  // 不用延迟聚焦
  if (!isDelay) loadEventListeners(_rootNode, _subNodes);

  return {
    /** 进入循环，聚焦 */
    enter() {
      _trigger = _trigger || getActiveElement();
      focus(head);
    },
    /** 退出循环，聚焦触发元素 */
    exit() {
      if (_trigger == null) {
        console.warn("未指定触发器，将不会聚焦触发器，您可以在调用 focusBagel 时传入选项 trigger 指定触发器，或者在触发触发器的时候调用函数 enter。");
        return;
      }
      focus(_trigger);
    },
    i: () => activeIndex,
  };

  function loadEventListeners(originRootNode, originSubNodes) {

    const { rootNode, subNodes, head, tail, exitNode } = getNodes(originRootNode, originSubNodes, exitStringOrElement);

    if (rootNode == null)
      throw new Error(`没有找到元素 ${originRootNode}，您可以尝试 delayToFocus 选项，等待元素 ${originRootNode} 渲染完毕后进行聚焦。`);
    if (head == null || tail == null)
      throw new Error("至少需要包含两个可以聚焦的元素，如果元素需要等待渲染，您可以尝试 delayToFocus 选项。");
    if (exitStringOrElement && exitNode == null)
      console.warn(`没有找到元素 ${exitStringOrElement}，如果元素需要等待渲染，您可以尝试 delayToFocus 选项。`);

    // 在焦点循环中触发聚焦
    const handleFocus = _manual ?
      focusNextManually(subNodes, rootNode, activeIndex, isClamp, enabledCover, onEscFocus, isForward, isBackward, onForward, onBackward, enterKey, exitKey, coverNextSibling) :
      focusNextKey(head, tail, rootNode, isClamp, enabledCover, onEscFocus, onForward, onBackward, enterKey, exitKey, coverNextSibling);

    const coverShiftTabHandler = handleCoverShiftTab(rootNode);

    if (removeListenersEachExit || !addedListeners)
      // 添加除 trigger 以外其它和焦点相关的事件监听器
      addedListeners = addEventListeners(rootNode, handleFocus, exitNode, exitHandler, coverNextSibling, coverShiftTabHandler);

    return {
      rootNode,
      head,
    };

    /** 点击退出触发器按钮的行为 */
    function exitHandler(e) {
      removeListeners();
      onExit && onExit(e);
      if (_trigger == null) {
        console.warn("未指定触发器，将不会聚焦触发器，您可以在调用 focusBagel 时传入选项 trigger 指定触发器，或者在触发触发器的时候调用函数 enter，如果您使用了选项 enter，您也可以设置 enter.selector 而不指定选项 trigger 或者调用函数 enter。");
        return;
      }
      focus(_trigger)
    }

    /** 按下按键 esc 的行为 */
    function onEscFocus(e) {
      if (disabledEsc) return;
      removeListeners();
      if (_onEscape) _onEscape(e);
      if (_trigger == null) {
        console.warn("未指定触发器，将不会聚焦触发器，您可以在调用 focusBagel 时传入选项 trigger 指定触发器，或者在触发触发器的时候调用函数 enter，如果您使用了选项 enter，您也可以设置 enter.selector 而不指定选项 trigger 或者调用函数 enter。");
        return;
      }
      return focus(_trigger);
    }

    function removeListeners() {
      if (removeListenersEachExit) {
        rootNode.removeEventListener("keydown", handleFocus);
        coverNextSibling?.removeEventListener("keydown", coverShiftTabHandler);
        exitNode.removeEventListener("click", exitHandler);
      }
    }
  }
};

export default focusBagel;