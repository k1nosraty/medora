package ir.medora.health

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.*

class AppointmentReminderTest {
    private val zone=ZoneId.of("Asia/Tehran")
    private val morning=ZonedDateTime.of(2026,10,10,7,0,0,0,zone)
    private fun visit(time:String="14:00",offsets:Set<Int> = emptySet())=Appointment(
        id="doctor",title="دکتر رضایی",wall="2026-10-10T$time",zone=zone.id,
        location="کلینیک",notes="نتایج آزمایش را ببرید",contact="۰۲۱۱۲۳۴",offsets=offsets)
    private fun reminders(a:Appointment,settings:Settings=Settings(consent=true),now:ZonedDateTime=morning)=
        Planner.plan(HealthData(settings=settings,appointments=mutableListOf(a)),now).filter { it.kind=="appointment" }
    private fun hours(items:List<Reminder>)=items.map { Instant.ofEpochMilli(it.at).atZone(zone).toLocalTime().toString() }

    @Test fun repeatsFromMorningAndStopsBeforeVisit() {
        val a=visit()
        val slots=reminders(a)
        assertEquals(listOf("08:00","10:00","12:00"),hours(slots))
        assertTrue(slots.all { it.at<a.instant().toEpochMilli() })
        assertEquals(listOf("08:00","09:00","10:00","11:00","12:00","13:00"),
            hours(reminders(a,Settings(consent=true,appointmentInterval=60))))
    }
    @Test fun earlyVisitAndDuplicateAdvanceNotice() {
        val early=visit("07:30",setOf(60,0))
        assertEquals(listOf("06:30"),hours(reminders(early,now=morning.withHour(5))))
        assertEquals(listOf("08:00","10:00"),hours(reminders(visit("11:00",setOf(60)))))
    }
    @Test fun customStartAndAlreadyElapsedReminders() {
        val settings=Settings(consent=true,appointmentStart="09:30")
        assertEquals(listOf("09:30","11:30","13:30"),hours(reminders(visit(),settings)))
        assertEquals(listOf("12:00"),hours(reminders(visit(),now=morning.withHour(10))))
        assertTrue(reminders(visit(),now=morning.withHour(14)).isEmpty())
    }
    @Test fun travelDoesNotMoveClinicMorning() {
        val a=visit()
        assertEquals(reminders(a),reminders(a,now=morning.withZoneSameInstant(ZoneId.of("America/New_York"))))
    }
    @Test fun detailsContainDoctorTimePlaceAndInstructions() {
        val appointment=reminders(visit()).first()
        assertTrue(appointment.title.contains("دکتر رضایی"))
        listOf("14:00","2026-10-10","کلینیک","نتایج آزمایش","۰۲۱۱۲۳۴").forEach { assertTrue(appointment.body.contains(it)) }
        val med=Medication(name="ویتامین D",instructions="یک عدد بعد غذا",startDay="2026-10-10",times=listOf("08:00"))
        val dose=Planner.plan(HealthData(settings=Settings(consent=true),medications=mutableListOf(med)),morning).first { it.kind=="dose" }
        assertTrue(dose.title.contains(med.name))
        assertTrue(dose.body.contains("08:00") && dose.body.contains(med.instructions))
        assertFalse(Settings().privateNotifications)
    }
    @Test fun staleCancelledOrPastAppointmentsDoNotNotify() {
        val a=visit()
        val data=HealthData(settings=Settings(consent=true),appointments=mutableListOf(a))
        val reminder=reminders(a).first()
        assertTrue(Planner.allowed(data,reminder,morning.withHour(8)))
        data.appointments[0]=a.copy(cancelled=true)
        assertFalse(Planner.allowed(data,reminder,morning.withHour(8)))
        data.appointments[0]=a.copy(wall="2026-10-11T14:00")
        assertFalse(Planner.allowed(data,reminder,morning.withHour(8)))
        data.appointments[0]=a
        assertFalse(Planner.allowed(data,reminder,morning.withHour(15)))
    }
    @Test fun schemaTwoMigratesWithoutLosingDataAndNewSettingsRoundTrip() {
        val data=HealthData(settings=Settings(consent=true,privateNotifications=true),appointments=mutableListOf(visit()))
        val legacy=JSONObject(Codec.encode(data)).apply {
            put("schema",2)
            getJSONObject("settings").apply { remove("appointmentStart");remove("appointmentInterval") }
        }
        val migrated=Codec.decode(legacy.toString())
        assertEquals(data.appointments,migrated.appointments)
        assertEquals("08:00",migrated.settings.appointmentStart)
        assertEquals(120,migrated.settings.appointmentInterval)
        assertFalse(migrated.settings.privateNotifications)
        val updated=data.copy(settings=data.settings.copy(appointmentStart="09:00",appointmentInterval=60))
        assertEquals(updated,Codec.decode(Codec.encode(updated)))
    }
    @Test fun zeroIntervalIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { visit().reminderTimes(Settings(appointmentInterval=0)) }
    }
}
