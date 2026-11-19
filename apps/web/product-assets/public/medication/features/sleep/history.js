import { button, element } from "../../shared/ui/dom.js";

export function renderSleepChart(host,cells) {
  host.replaceChildren(...cells.map(({day,label,number,selected,size,choose})=>{
    const item=element("li");
    const control=button(number,choose);
    control.dataset.focusKey="sleep-chart-"+day;
    control.setAttribute("aria-label",label);
    control.setAttribute("aria-pressed",String(selected));
    const bar=element("span");
    bar.setAttribute("aria-hidden","true");
    bar.style.setProperty("--sleep-bar",size);
    control.prepend(bar);
    item.append(control);
    return item;
  }));
}

export function renderSleepHistory(host,entries) {
  host.replaceChildren(...entries.map(({title,when,quality,note,actions})=>{
    const article=element("article","","sleep-history-row");
    const detail=element("div");
    detail.append(element("strong",title),element("p",when,"quiet"));
    if(quality) detail.append(element("p",quality,"quiet"));
    if(note) detail.append(element("p",note,"quiet"));
    article.append(detail);
    if(actions) {
      const edit=button(actions.editLabel,actions.edit),remove=button(actions.removeLabel,actions.remove);
      edit.className=remove.className="text-button";
      article.append(edit,remove);
    }
    return article;
  }));
}
