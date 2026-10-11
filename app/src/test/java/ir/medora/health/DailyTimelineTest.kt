package ir.medora.health

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class DailyTimelineTest {
    @Test fun mixesDosesAndVisitsInTimeOrderAndExcludesOtherDaysAndCancelledVisits() {
        val day=LocalDate.now()
        val data=HealthData()
        val med=Medication(id="timeline-med",name="Medicine",startDay=day.toString(),times=listOf("08:00","17:00"))
        data.medications.add(med)
        data.doses.add(Dose.of(med,day,"08:00").copy(status=DoseStatus.TAKEN))
        data.doses.add(Dose.of(med,day,"17:00"))
        data.appointments.add(Appointment(id="visit",title="Doctor",wall=day.atTime(12,0).toString(),zone=ZoneId.systemDefault().id))
        data.appointments.add(Appointment(id="tomorrow",title="Tomorrow",wall=day.plusDays(1).atTime(9,0).toString(),zone=ZoneId.systemDefault().id))
        data.appointments.add(Appointment(id="cancelled",title="Cancelled",wall=day.atTime(10,0).toString(),zone=ZoneId.systemDefault().id,cancelled=true))
        val events=dailyTimeline(data,day)
        assertEquals(listOf(8,12,17),events.map {it.time.hour})
        assertEquals("visit",events[1].appointment?.id)
        assertEquals(DoseStatus.TAKEN,events[0].dose?.status)
        assertTrue(events.none {it.appointment?.id in listOf("tomorrow","cancelled")})
    }
}
