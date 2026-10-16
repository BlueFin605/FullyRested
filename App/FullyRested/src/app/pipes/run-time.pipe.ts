import { Pipe, PipeTransform } from '@angular/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

// An ISO UTC start time in the viewer's local time: "14:32:07" today, "3 Oct 14:32:07" on any other day
@Pipe({
  name: 'runTime',
  standalone: false,
})
export class RunTimePipe implements PipeTransform {
  transform(iso: string | undefined | null, now: Date = new Date()): string {
    if (iso == undefined) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const time = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    const today = d.getFullYear() == now.getFullYear() && d.getMonth() == now.getMonth() && d.getDate() == now.getDate();
    return today ? time : `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
  }
}
