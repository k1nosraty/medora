package ir.medora.health

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/** Presentation only: appointments appear on their actual day in the device zone. */
data class DailyTimelineEvent(val time: LocalDateTime, val id: String, val dose: Dose?=null, val appointment: Appointment?=null)
fun dailyTimeline(data: HealthData, day: LocalDate): List<DailyTimelineEvent> {
    val doses=data.calendarDoses(day).map { DailyTimelineEvent(LocalDateTime.parse(it.wall),"dose-${it.id}",dose=it) }
    val visits=data.appointments.filterNot {it.cancelled}.map { DailyTimelineEvent(it.instant().atZone(ZoneId.systemDefault()).toLocalDateTime(),"appointment-${it.id}",appointment=it) }.filter {it.time.toLocalDate()==day}
    return (doses+visits).sortedWith(compareBy<DailyTimelineEvent>{it.time}.thenBy{it.id})
}
