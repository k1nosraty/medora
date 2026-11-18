import { shortWeek, weekIndex } from "../i18n/locale.js";

/**
 * @param {{start:number,end:number,selected:number,active?:number,today:number,last?:number,minCells?:number,
 * formatDay:(day:number,long:boolean)=>string,formatNumber:(day:number)=>string,
 * onSelect:(day:number,focus:boolean)=>void,onMove?:(day:number,focus:boolean)=>void,
 * describe?:(day:number)=>{caption:string,dots:string[],cycle?:string|undefined}|null}} options
 */
export function monthLayout({ start, end, selected, active = selected, today, last = Infinity,
  minCells = 0, formatDay, formatNumber, onSelect, onMove = onSelect, describe = () => null }) {
  const direction = document.documentElement.dir === "rtl" ? -1 : 1;
  const leading = weekIndex(start);
  const trailing = Math.max(0, minCells - leading - (end - start + 1));
  const tabbable = Math.max(start, Math.min(active, end, last));
  return {
    leading, trailing, weekdays: shortWeek,
    days: Array.from({ length: end - start + 1 }, (_, offset) => {
      const day = start + offset;
      const details = describe(day);
      return {
        day, number: formatNumber(day), label: formatDay(day, true) + (details?.caption ?? ""),
        details, tabIndex: day === tabbable && day <= last ? 0 : -1, disabled: day > last,
        selected: day === selected, today: day === today, choose: () => onSelect(day, true),
        move: (/** @type {{key:string,preventDefault():void}} */ event) => {
          const target = { ArrowLeft: day - direction, ArrowRight: day + direction,
            ArrowUp: day - 7, ArrowDown: day + 7, Home: day - weekIndex(day), End: day + 6 - weekIndex(day) }[event.key];
          if (target === undefined) return;
          event.preventDefault();
          if (target <= last) onMove(target, true);
        }
      };
    })
  };
}

export function keepMonthFocus(root, paint) {
  const focused = root.contains(document.activeElement);
  paint();
  if (focused) root.querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
}
