package ir.medora.health

import java.time.*
import java.util.UUID
import java.time.temporal.ChronoUnit

fun id(): String = UUID.randomUUID().toString()
fun normalize(value: String): String {
    var s=value
    "۰۱۲۳۴۵۶۷۸۹".forEachIndexed { i,c -> s=s.replace(c,('0'.code+i).toChar()) }
    "٠١٢٣٤٥٦٧٨٩".forEachIndexed { i,c -> s=s.replace(c,('0'.code+i).toChar()) }
    return s
}
fun parseTimes(value: String): List<String> = normalize(value).replace('،',',').split(',')
    .map { LocalTime.parse(it.trim()).withSecond(0).withNano(0).toString() }.distinct().sorted()
    .also { require(it.size in 1..12) { "بین ۱ تا ۱۲ ساعت وارد کنید" } }
fun parseDates(value: String): Set<String> = if(value.isBlank()) emptySet() else
    normalize(value).replace('،',',').split(',').map { LocalDate.parse(it.trim()).toString() }.toSet()

data class Settings(
    val goal: Int=2000, val waterEnabled: Boolean=false, val start: String="08:00",
    val end: String="22:00", val interval: Int=60, val repeat: Int=0,
    val pauseUntil: Long=0, val consent: Boolean=false, val privateNotifications: Boolean=false,
    val appointmentStart: String="08:00", val appointmentInterval: Int=120,
    val language: String="fa", val calendar: String="jalali", val medicationSnoozeMinutes:Int=10
)
data class Water(val id:String=id(),val ml:Int,val day:String,val at:Long) {
    fun editTime(zone:ZoneId):LocalDateTime = LocalDate.parse(day).atTime(
        Instant.ofEpochMilli(at).atZone(zone).toLocalTime().withSecond(0).withNano(0))
    fun edited(ml:Int,displayed:LocalDateTime,zone:ZoneId):Water {
        require(ml in 1..10000)
        return if(displayed==editTime(zone)) copy(ml=ml) else
            copy(ml=ml,day=displayed.toLocalDate().toString(),at=displayed.atZone(zone).toInstant().toEpochMilli())
    }
}
data class Medication(
    val id:String=id(),val name:String,val instructions:String="",val startDay:String,
    val times:List<String>,val weekdays:Set<Int> = (1..7).toSet(),val dates:Set<String> = emptySet(),val active:Boolean=true,val effectiveFrom:Long=0,
    val icon:MedicationIcon=MedicationIcon.CAPSULE,val color:MedicationColor=MedicationColor.ORANGE
) {
    fun occurs(day:LocalDate):Boolean = active && day.toString()>=startDay &&
        if(dates.isNotEmpty()) day.toString() in dates else day.dayOfWeek.value in weekdays
}
enum class DoseStatus { PENDING, TAKEN, SNOOZED, SKIPPED }
data class Dose(
    val id:String,val medicationId:String,val name:String,val instructions:String,val wall:String,
    val status:DoseStatus=DoseStatus.PENDING,val snoozeUntil:Long=0,val updatedAt:Long=0,
    val icon:MedicationIcon=MedicationIcon.CAPSULE,val color:MedicationColor=MedicationColor.ORANGE
) {
    companion object {
        fun of(m:Medication,day:LocalDate,time:String)=Dose("${m.id}|$day|$time",m.id,m.name,m.instructions,"${day}T$time",icon=m.icon,color=m.color)
    }
}
// An appointment belongs to the timezone of the clinic, not the phone's timezone
// after travel. The UI shows this explicitly and allows editing the IANA zone.
data class Appointment(
    val id:String=id(),val title:String,val wall:String,val zone:String,
    val location:String="",val notes:String="",val contact:String="",
    val offsets:Set<Int> = setOf(60),val cancelled:Boolean=false
) {
    fun instant():Instant = LocalDateTime.parse(wall).atZone(ZoneId.of(zone)).toInstant()
    fun reminderTimes(settings:Settings):List<Long> {
        require(settings.appointmentInterval in setOf(60,120))
        val visit=LocalDateTime.parse(wall).atZone(ZoneId.of(zone))
        var next=visit.toLocalDate().atTime(LocalTime.parse(settings.appointmentStart)).atZone(visit.zone)
        // Early appointments still get advance notice before the morning window.
        if(!next.isBefore(visit))next=visit.minusHours(1)
        val times=mutableSetOf<Long>()
        while(next.isBefore(visit)) {
            times+=next.toInstant().toEpochMilli()
            next=next.plusMinutes(settings.appointmentInterval.toLong())
        }
        offsets.filter { it>0 }.forEach { times+=visit.toInstant().minusSeconds(it*60L).toEpochMilli() }
        return times.sorted()
    }
}
data class Reminder(val key:String,val kind:String,val reference:String,val at:Long,
    val title:String="",val body:String="",val waterBase:String="")
data class HealthData(
    var settings:Settings=Settings(),val water:MutableList<Water> = mutableListOf(),
    val medications:MutableList<Medication> = mutableListOf(),val doses:MutableList<Dose> = mutableListOf(),
    val appointments:MutableList<Appointment> = mutableListOf(),
    val waterAcknowledged:MutableSet<String> = mutableSetOf(),val waterSnoozes:MutableMap<String,Long> = mutableMapOf(),
    val handledActions:MutableList<String> = mutableListOf(),var through:String="",
    var nextNotificationId:Int=1,val notificationIds:MutableMap<String,Int> = mutableMapOf(),
    var reminderCheckpoint:Long=0,val deliveredReminders:MutableMap<String,Long> = mutableMapOf()
) {
    fun total(day:String)=water.filter { it.day==day }.sumOf { it.ml }
    fun remaining(day:String)=(settings.goal-total(day)).coerceAtLeast(0)
    fun progress(day:String)=(total(day).toFloat()/settings.goal).coerceIn(0f,1f)
    fun dayDoses(day:String)=doses.filter { it.wall.startsWith("${day}T") }.sortedBy { it.wall }
    fun addWater(ml:Int,whenAt:ZonedDateTime) {
        require(ml in 1..10000) { "مقدار آب باید از ۱ تا ۱۰۰۰۰ میلی‌لیتر باشد" }
        water += Water(ml=ml,day=whenAt.toLocalDate().toString(),at=whenAt.toInstant().toEpochMilli())
        val minute=whenAt.hour*60+whenAt.minute
        val start=LocalTime.parse(settings.start).let { it.hour*60+it.minute }
        val end=LocalTime.parse(settings.end).let { it.hour*60+it.minute }
        if(minute in start until end) {
            val base="water|${whenAt.toLocalDate()}|${start+(minute-start)/settings.interval*settings.interval}"
            waterAcknowledged += base;waterSnoozes.remove(base)
        }
    }
    fun materialize(now:ZonedDateTime) {
        val end=now.toLocalDate()
        var day=if(through.isEmpty()) end else LocalDate.parse(through)
        while(!day.isAfter(end)) { materializeDay(day,now.zone);day=day.plusDays(1) }
        through=end.toString()
        waterAcknowledged.removeAll { !it.contains(end.toString()) }
        waterSnoozes.entries.removeAll { it.value<now.minusDays(2).toInstant().toEpochMilli() }
    }
    fun materializeDay(day:LocalDate,zone:ZoneId=ZoneId.systemDefault()) {
        val keys=doses.map { it.id }.toMutableSet()
        medications.filter { it.occurs(day) }.forEach { m -> m.times.forEach { t ->
            val dose=Dose.of(m,day,t)
            val at=LocalDateTime.parse(dose.wall).atZone(zone).toInstant().toEpochMilli()
            if(at>=m.effectiveFrom && keys.add(dose.id)) doses += dose
        } }
    }
    fun changeMedication(m:Medication,now:ZonedDateTime) {
        materialize(now);medications.removeAll { it.id==m.id };medications += m.copy(effectiveFrom=now.toInstant().toEpochMilli())
        doses.removeAll { it.medicationId==m.id && it.status==DoseStatus.PENDING &&
            LocalDateTime.parse(it.wall).isAfter(now.toLocalDateTime()) }
        materializeDay(now.toLocalDate(),now.zone)
    }
    fun deleteMedication(key:String,now:ZonedDateTime) {
        materialize(now);medications.removeAll { it.id==key }
        doses.removeAll { it.medicationId==key && it.status==DoseStatus.PENDING &&
            LocalDateTime.parse(it.wall).isAfter(now.toLocalDateTime()) }
    }
    fun mark(dose:Dose,status:DoseStatus,now:Instant) {
        doses.removeAll { it.id==dose.id }
        doses += dose.copy(status=status,updatedAt=now.toEpochMilli(),
            snoozeUntil=if(status==DoseStatus.SNOOZED) now.plusSeconds(settings.medicationSnoozeMinutes * 60L).toEpochMilli() else 0)
    }
    fun notificationId(key:String):Int = notificationIds.getOrPut(key) {
        require(nextNotificationId<Int.MAX_VALUE-1);nextNotificationId++
    }
    fun validate() {
        require(settings.medicationSnoozeMinutes in 1..1440)
        require(settings.goal in 1..20000) { "هدف روزانه معتبر نیست" }
        require(settings.interval in 15..240 && settings.repeat in 0 until settings.interval)
        require(LocalTime.parse(settings.start)<LocalTime.parse(settings.end)) { "شروع باید قبل از پایان باشد" }
        LocalTime.parse(settings.appointmentStart)
        require(settings.appointmentInterval in setOf(60,120)) { "فاصله یادآوری قرار باید یک یا دو ساعت باشد" }
        require(settings.language in setOf("fa", "en"))
        require(settings.calendar in setOf("jalali", "gregorian"))
        require(water.all { it.ml in 1..10000 })
        medications.forEach { m ->
            require(m.name.isNotBlank() && m.times.size in 1..12 && (m.weekdays.isNotEmpty() || m.dates.isNotEmpty()))
            require(m.weekdays.all { it in 1..7 });LocalDate.parse(m.startDay)
            m.times.forEach { LocalTime.parse(it) };m.dates.forEach { LocalDate.parse(it) }
        }
        appointments.forEach { a ->
            require(a.title.isNotBlank() && a.offsets.all { it in 0..43200 });a.instant()
        }
    }
}
object Planner {
    fun plan(data:HealthData,now:ZonedDateTime,days:Int=8):List<Reminder> {
        if(!data.settings.consent) return emptyList()
        val s=data.settings;val zone=now.zone;val nowMs=now.toInstant().toEpochMilli();val language=s.language
        val output=mutableListOf<Reminder>();val existing=data.doses.associateBy { it.id }
        val candidate=mutableMapOf<String,Dose>()
        for(i in 0 until days) {
            val day=now.toLocalDate().plusDays(i.toLong())
            data.medications.filter { it.occurs(day) }.forEach { m ->m.times.forEach { t ->
                val dose=Dose.of(m,day,t)
                val at=LocalDateTime.parse(dose.wall).atZone(zone).toInstant().toEpochMilli()
                if(dose.id in existing || at>=m.effectiveFrom) candidate[dose.id]=existing[dose.id]?:dose
            } }
            if(s.waterEnabled && data.total(day.toString())<s.goal) {
                val start=LocalTime.parse(s.start).let { it.hour*60+it.minute }
                val end=LocalTime.parse(s.end).let { it.hour*60+it.minute }
                for(minute in start until end step s.interval) {
                    val base="water|$day|$minute"
                    if(base in data.waterAcknowledged || base in data.waterSnoozes) continue
                    for(retry in if(s.repeat==0) listOf(0) else listOf(0,s.repeat)) {
                        if(minute+retry>=end) continue
                        val local=day.atStartOfDay().plusMinutes((minute+retry).toLong())
                        val at=local.atZone(zone).toInstant().toEpochMilli()
                        if(at>nowMs && at>=s.pauseUntil) output += Reminder(
                            "$base|$retry", "water", base, at,
                            localizedText("notification.waterTitle", language),
                            localizedText("notification.waterBody", language), base
                        )
                    }
                }
            }
        }
        data.doses.filter { it.status==DoseStatus.SNOOZED }.forEach { d ->
            val m=data.medications.find { it.id==d.medicationId && it.active }
            if(m!=null && d.wall.substring(11) in m.times && m.occurs(LocalDateTime.parse(d.wall).toLocalDate())) candidate[d.id]=d
        }
        candidate.values.forEach { d ->
            if(d.status==DoseStatus.TAKEN || d.status==DoseStatus.SKIPPED) return@forEach
            val at=if(d.status==DoseStatus.SNOOZED) d.snoozeUntil else LocalDateTime.parse(d.wall).atZone(zone).toInstant().toEpochMilli()
            if(at>nowMs) {
                val time=LocalTime.parse(d.wall.substring(11)).toString()
                val body=listOf(localizedText("notification.doseTime", language, time),d.instructions)
                    .filter { it.isNotBlank() }.joinToString("\n")
                output += Reminder(
                    "dose|${d.id}|$at", "dose", d.id, at,
                    localizedText("notification.doseTitle", language, d.name), body
                )
            }
        }
        if(s.waterEnabled) data.waterSnoozes.forEach { (base,at) ->
            val local=Instant.ofEpochMilli(at).atZone(zone)
            if(at>nowMs && at>=s.pauseUntil && base !in data.waterAcknowledged &&
                local.toLocalTime()>=LocalTime.parse(s.start) && local.toLocalTime()<LocalTime.parse(s.end) &&
                data.total(local.toLocalDate().toString())<s.goal)
                output += Reminder(
                    "$base|snooze|$at", "water", base, at,
                    localizedText("notification.waterTitle", language),
                    localizedText("notification.waterSnoozed", language), base
                )
        }
        data.appointments.filter { !it.cancelled }.forEach { a ->a.reminderTimes(s).forEach { at ->
            val local=LocalDateTime.parse(a.wall)
            val date=local.toLocalDate().toString()
            val time=local.toLocalTime().toString()
            val body=listOf(localizedText("notification.appointmentTime", language, date, time),
                a.location.takeIf { it.isNotBlank() }?.let { localizedText("notification.location", language, it) }.orEmpty(),a.notes,
                a.contact.takeIf { it.isNotBlank() }?.let { localizedText("notification.contact", language, it) }.orEmpty())
                .filter { it.isNotBlank() }.joinToString("\n")
            if(at>nowMs) output += Reminder(
                "appointment|${a.id}|$at", "appointment", a.id, at,
                localizedText("notification.appointmentTitle", language, a.title), body
            )
        } }
        // Calendar rollover guarantees queue refresh even with no reminder today.
        val midnight=now.toLocalDate().plusDays(1).atStartOfDay(zone).plusMinutes(1).toInstant().toEpochMilli()
        output += Reminder("maintenance|${now.toLocalDate()}","maintenance","",midnight)
        return output.sortedWith(compareBy<Reminder> { it.at }.thenBy { it.key })
    }
    const val RECOVERY_MILLIS=24*60*60*1000L
    fun overdue(data:HealthData,now:ZonedDateTime,queuedAt:Long?=null):List<Reminder> {
        if(!data.settings.consent) return emptyList()
        val current=now.toInstant().toEpochMilli()
        val checkpoint=when {
            data.reminderCheckpoint>0 -> data.reminderCheckpoint
            queuedAt!=null && queuedAt<=current -> queuedAt-1
            else -> current
        }.coerceIn(current-RECOVERY_MILLIS,current)
        val since=Instant.ofEpochMilli(checkpoint).atZone(now.zone)
        val days=ChronoUnit.DAYS.between(since.toLocalDate(),now.toLocalDate()).toInt()+1
        val due=plan(data,since,days).filter {
            it.at<=current && it.kind!="maintenance" && it.key !in data.deliveredReminders && allowed(data,it,now)
        }
        // Repeated water/appointment prompts should not create a burst after
        // a long delay. Distinct medication doses must each remain visible.
        val water=due.filter { it.kind=="water" }.maxByOrNull { it.at }
        val appointments=due.filter { it.kind=="appointment" }.groupBy { it.reference }
            .values.map { slots ->slots.maxBy { it.at } }
        return (due.filter { it.kind=="dose" }+appointments+listOfNotNull(water)).sortedBy { it.at }
    }
    fun content(data:HealthData,r:Reminder):Reminder {
        val language=data.settings.language
        return when(r.kind) {
            "dose" -> data.doses.find { it.id==r.reference }?.let { d ->
                r.copy(title=localizedText("notification.doseTitle",language,d.name),body=listOf(
                    localizedText("notification.doseTime",language,d.wall.substring(11)),d.instructions
                ).filter { it.isNotBlank() }.joinToString("\n"))
            } ?: r
            "appointment" -> data.appointments.find { it.id==r.reference }?.let { a ->
                val local=LocalDateTime.parse(a.wall)
                r.copy(title=localizedText("notification.appointmentTitle",language,a.title),body=listOf(
                    localizedText("notification.appointmentTime",language,local.toLocalDate(),local.toLocalTime()),
                    a.location.takeIf { it.isNotBlank() }?.let { localizedText("notification.location",language,it) }.orEmpty(),
                    a.notes,a.contact.takeIf { it.isNotBlank() }?.let { localizedText("notification.contact",language,it) }.orEmpty()
                ).filter { it.isNotBlank() }.joinToString("\n"))
            } ?: r
            "water" -> r.copy(title=localizedText("notification.waterTitle",language),body=localizedText("notification.waterBody",language))
            else -> r
        }
    }
    fun allowed(data:HealthData,r:Reminder,now:ZonedDateTime):Boolean = data.settings.consent && when(r.kind) {
        "dose" -> data.doses.find { it.id==r.reference }?.let { dose ->
            data.medications.any { m -> m.id==dose.medicationId && m.occurs(LocalDateTime.parse(dose.wall).toLocalDate()) && dose.wall.substring(11) in m.times } &&
                dose.status !in setOf(DoseStatus.TAKEN,DoseStatus.SKIPPED) &&
                r.at==(if(dose.status==DoseStatus.SNOOZED) dose.snoozeUntil else
                    LocalDateTime.parse(dose.wall).atZone(now.zone).toInstant().toEpochMilli())
        } == true
        "water" -> data.settings.waterEnabled && now.toLocalTime()>=LocalTime.parse(data.settings.start) &&
            now.toLocalTime()<LocalTime.parse(data.settings.end) && data.total(now.toLocalDate().toString())<data.settings.goal &&
            r.waterBase.substringAfter("water|").substringBefore('|')==now.toLocalDate().toString() &&
            r.waterBase !in data.waterAcknowledged && now.toInstant().toEpochMilli()>=data.settings.pauseUntil
        "appointment" -> data.appointments.any { it.id==r.reference && !it.cancelled && it.instant().isAfter(now.toInstant()) &&
            r.at in it.reminderTimes(data.settings) }
        else -> false
    }
}

fun MutableList<Appointment>.replace(appointment: Appointment) {
    removeAll { it.id == appointment.id };add(appointment)
}

