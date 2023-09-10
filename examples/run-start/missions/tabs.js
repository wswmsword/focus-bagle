const tabList = ["#tab_1", "#tab_2", "#tab_3", "#tab_4", "#tab_5"];

// 4～17 行为焦点管理的部分，管理了焦点的入口、出口，以及焦点在列表内的移动
focusFly("#tab_list", tabList, { // L:4
  next: "ArrowRight",
  prev: "ArrowLeft",
  exit: [{
    key: "Tab",
    target: "#tags_code",
  }, {
    key: "Shift-Tab",
    target: "#navigation_code",
  }],
  initialActive: 1,
  removeListenersEachExit: false,
  onMove,
}); // L:17

// 下面的函数和焦点无关，和样式或其它逻辑有关，这些代码在实际开发中，可以和上面的焦点部分分开，或者可以像本例中，把这些代码集成到焦点管理中

/** 进行样式修改，当焦点移动时，本次聚焦添加样式，上一次聚焦移除样式，更新 ARIA */
function onMove({ prev, cur, prevI, curI }) {
  if (prevI === -1 || curI === -1) return;
  prev.setAttribute("aria-selected", "false");
  cur.setAttribute("aria-selected", "true");
  const prevPanel = document.getElementById("tabpanel_" + (prevI + 1));
  const curPanel = document.getElementById("tabpanel_" + (curI + 1));
  prevPanel.classList.add('is-hidden');
  curPanel.classList.remove('is-hidden');
}