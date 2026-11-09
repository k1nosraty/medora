package ir.medora.health

import ir.medora.care.*
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
    val icon:MedicationIcon=MedicationIcon.CAPSULE,val color:MedicationColor=MedicationColor.ORANGE,
    val phases:List<MedicationPhase> = emptyList(), val unit:String="", val milliUnits:Int?=null,
    val stock:MedicationStock?=null
) {
    fun occurs(day:LocalDate):Boolean = active && if(phases.isNotEmpty()) {
        slotsForDay(phases,day.toEpochDay().toInt()).isNotEmpty()
    } else day.toString()>=startDay && if(dates.isNotEmpty()) day.toString() in dates else day.dayOfWeek.value in weekdays
}
data class MedicationStock(val balance:Int,val threshold:Int,val trackedFrom:Long,val alerted:Boolean=false) {
    val low get()=stockIsLow(balance,threshold)
}
enum class DoseStatus { PENDING, TAKEN, SNOOZED, SKIPPED }
data class Dose(
    val id:String,val medicationId:String,val name:String,val instructions:String,val wall:String,
    val status:DoseStatus=DoseStatus.PENDING,val snoozeUntil:Long=0,val updatedAt:Long=0,
    val icon:MedicationIcon=MedicationIcon.CAPSULE,val color:MedicationColor=MedicationColor.ORANGE,
    val milliUnits:Int?=null,val unit:String="",val actualMilliUnits:Int?=null,val stockDebit:Int=0
) {
    fun scheduledAt(zone: ZoneId): Instant = LocalDateTime.parse(wall).atZone(zone).toInstant()

    fun reminderAt(zone: ZoneId): Instant {
        val scheduled = scheduledAt(zone)
        // Older versions could persist a snooze before the original due time.
        return if (status == DoseStatus.SNOOZED) maxOf(scheduled, Instant.ofEpochMilli(snoozeUntil)) else scheduled
    }

    companion object {
        fun of(m:Medication,day:LocalDate,time:String,milliUnits:Int?=m.milliUnits)=Dose(
            "${m.id}|$day|$time",m.id,m.name,m.instructions,"${day}T$time",icon=m.icon,color=m.color,
            milliUnits=milliUnits,unit=m.unit)

        fun on(m:Medication,day:LocalDate):List<Dose> {
            if(!m.active) return emptyList()
            if(m.phases.isEmpty()) return if(m.occurs(day)) m.times.map { of(m,day,it) } else emptyList()
            return slotsForDay(m.phases,day.toEpochDay().toInt()).map { slot ->
                of(m,day,LocalTime.of(slot.minuteOfDay/60,slot.minuteOfDay%60).toString(),slot.milliUnits)
            }
        }
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
        medications.forEach { m -> Dose.on(m,day).forEach { dose ->
            val at=LocalDateTime.parse(dose.wall).atZone(zone).toInstant().toEpochMilli()
            if(at>=m.effectiveFrom && keys.add(dose.id)) doses += dose
        } }
    }
    fun changeMedication(m:Medication,now:ZonedDateTime) {
        materialize(now)
        val previous=medications.find { it.id==m.id }
        val stock=if(m.stock!=null && previous?.stock!=null) {
            require(previous.unit==m.unit)
            previous.stock.copy(threshold=m.stock.threshold)
        } else m.stock
        val updated=m.copy(effectiveFrom=now.toInstant().toEpochMilli(),stock=stock)
        medications.removeAll { it.id==m.id };medications += updated
        if(stock==null) doses.indices.filter { doses[it].medicationId==m.id && doses[it].stockDebit>0 }
            .forEach { doses[it]=doses[it].copy(stockDebit=0) }
        doses.removeAll { dose ->
            dose.medicationId==m.id && dose.scheduledAt(now.zone).isAfter(now.toInstant()) &&
                (dose.status==DoseStatus.PENDING || (dose.status==DoseStatus.SNOOZED && !updated.matches(dose)))
        }
        materializeDay(now.toLocalDate(),now.zone)
    }
    fun deleteMedication(key:String,now:ZonedDateTime) {
        materialize(now);medications.removeAll { it.id==key }
        doses.removeAll { it.medicationId==key && it.status==DoseStatus.PENDING &&
            LocalDateTime.parse(it.wall).isAfter(now.toLocalDateTime()) }
    }
    fun mark(dose:Dose,status:DoseStatus,now:Instant,zone:ZoneId=ZoneId.systemDefault(),actualAmount:Int?=null) {
        val previous = doses.find { it.id == dose.id } ?: dose
        require(actualAmount==null || actualAmount in 1..MAX_QUANTITY)
        val takenAmount=if(status==DoseStatus.TAKEN) actualAmount ?: previous.actualMilliUnits ?: previous.milliUnits else null
        val medication=medications.find { it.id==previous.medicationId }
        val stock=medication?.stock
        val debit=if(stock!=null && previous.unit==medication.unit &&
            previous.scheduledAt(zone).toEpochMilli()>=stock.trackedFrom) takenAmount ?: 0 else 0
        if(stock!=null && debit!=previous.stockDebit) {
            val updated=stock.copy(balance=stockBalance(stock.balance,previous.stockDebit,debit))
            medications[medications.indexOf(medication)]=medication.copy(stock=updated)
        }
        val snoozeUntil = if (status == DoseStatus.SNOOZED) {
            maxOf(now, previous.reminderAt(zone)).plusSeconds(settings.medicationSnoozeMinutes * 60L).toEpochMilli()
        } else 0
        doses.removeAll { it.id==dose.id }
        doses += previous.copy(status=status,updatedAt=now.toEpochMilli(),
            snoozeUntil=snoozeUntil,actualMilliUnits=takenAmount,stockDebit=debit)
    }

    fun addStock(medicationId:String,amount:Int) {
        require(amount in 1..MAX_QUANTITY)
        val index=medications.indexOfFirst { it.id==medicationId }
        require(index>=0)
        val medication=medications[index]
        val stock=requireNotNull(medication.stock)
        val updated=stock.copy(balance=stockBalance(stock.balance,0,0,amount))
        medications[index]=medication.copy(stock=updated)
    }

    fun lowStock(medication:Medication,now:ZonedDateTime):Boolean {
        val stock=medication.stock ?: return false
        if(!medication.active) return false
        val today=now.toLocalDate().toEpochDay()
        val days=when {
            medication.phases.isNotEmpty() -> medication.phases.asSequence().flatMap { phase ->
                val first=maxOf(today,phase.startDay.toLong())
                val last=minOf(first+364,phase.endBeforeDay?.toLong()?.minus(1) ?: Long.MAX_VALUE)
                (first..last).asSequence()
            }
            medication.dates.isNotEmpty() -> medication.dates.sorted().asSequence().map { LocalDate.parse(it).toEpochDay() }.filter { it>=today }
            else -> maxOf(today,LocalDate.parse(medication.startDay).toEpochDay()).let { (it..it+7).asSequence() }
        }
        val alreadyTaken=doses.asSequence().filter { it.medicationId==medication.id && it.status in setOf(DoseStatus.TAKEN,DoseStatus.SKIPPED) }
            .map { it.id }.toSet()
        val next=days.flatMap { Dose.on(medication,LocalDate.ofEpochDay(it)).asSequence() }
            .firstOrNull { it.id !in alreadyTaken && !it.scheduledAt(now.zone).isBefore(now.toInstant()) } ?: return false
        return stockIsLow(stock.balance,stock.threshold,next.milliUnits ?: 0)
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
            if(m.phases.isNotEmpty()) validatePhases(m.phases)
            require(m.unit.length<=40 && (m.milliUnits==null || m.milliUnits in 1..MAX_QUANTITY))
            if(m.milliUnits!=null || m.phases.any { phase -> phase.slots.any { it.milliUnits!=null } }) require(m.unit.isNotBlank())
            m.stock?.let { stock ->
                require(stock.balance in -MAX_QUANTITY..MAX_QUANTITY && stock.threshold in 0..MAX_QUANTITY && stock.trackedFrom>=0)
                require(m.unit.isNotBlank() && if(m.phases.isEmpty()) m.milliUnits!=null else
                    m.phases.all { phase -> phase.slots.all { it.milliUnits!=null } })
            }
        }
        doses.forEach { d ->
            require(d.milliUnits==null || d.milliUnits in 1..MAX_QUANTITY)
            require(d.actualMilliUnits==null || d.actualMilliUnits in 1..MAX_QUANTITY)
            require(d.stockDebit==0 || (d.status==DoseStatus.TAKEN && d.stockDebit==d.actualMilliUnits))
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
            data.medications.forEach { m ->Dose.on(m,day).forEach { dose ->
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
            if(m?.matches(d)==true) candidate[d.id]=d
        }
        candidate.values.forEach { d ->
            if(d.status==DoseStatus.TAKEN || d.status==DoseStatus.SKIPPED) return@forEach
            val at=d.reminderAt(zone).toEpochMilli()
            if(at>nowMs) {
                val time=LocalTime.parse(d.wall.substring(11)).toString()
                val body=listOf(localizedText("notification.doseTime", language, time),d.quantityText(),d.instructions)
                    .filter { it.isNotBlank() }.joinToString("\n")
                output += Reminder(
                    "dose|${d.id}|$at", "dose", d.id, at,
                    localizedText("notification.doseTitle", language, d.name), body
                )
            }
        }
        if(s.waterEnabled) data.waterSnoozes.forEach { (base,at) ->
            val local=Instant.ofEpochMilli(at).atZone(zone)
            val reminder = Reminder(
                "$base|snooze|$at", "water", base, at,
                localizedText("notification.waterTitle", language),
                localizedText("notification.waterSnoozed", language), base
            )
            if (at > nowMs && waterAllowed(data, reminder, local)) output += reminder
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
                    localizedText("notification.doseTime",language,d.wall.substring(11)),d.quantityText(),d.instructions
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
            "water" -> r.copy(title=localizedText("notification.waterTitle",language),body=localizedText(
                if(data.waterSnoozes[r.waterBase]==r.at) "notification.waterSnoozed" else "notification.waterBody",language))
            "stock" -> data.medications.find { it.id==r.reference }?.let { m -> r.copy(
                title=localizedText("care.stockNotification",language),body=localizedText("care.stockNotificationBody",language,m.name)) } ?: r
            else -> r
        }
    }
    private fun waterAllowed(data: HealthData, reminder: Reminder, now: ZonedDateTime): Boolean {
        val settings = data.settings
        val day = now.toLocalDate()
        val startTime = LocalTime.parse(settings.start)
        val endTime = LocalTime.parse(settings.end)
        if (!settings.waterEnabled || now.toLocalTime() < startTime || now.toLocalTime() >= endTime ||
            data.total(day.toString()) >= settings.goal || reminder.waterBase in data.waterAcknowledged ||
            reminder.at < settings.pauseUntil) return false
        val prefix = "water|$day|"
        if (!reminder.waterBase.startsWith(prefix)) return false
        val minute = reminder.waterBase.removePrefix(prefix).toIntOrNull() ?: return false
        val start = startTime.hour * 60 + startTime.minute
        val end = endTime.hour * 60 + endTime.minute
        if (minute !in start until end || (minute - start) % settings.interval != 0) return false

        val due = day.atStartOfDay().plusMinutes(minute.toLong()).atZone(now.zone).toInstant().toEpochMilli()
        val snoozed = data.waterSnoozes[reminder.waterBase]
        if (snoozed != null) return reminder.at == snoozed && snoozed >= due
        if (reminder.at == due) return true
        if (settings.repeat == 0 || minute + settings.repeat >= end) return false
        val retry = day.atStartOfDay().plusMinutes((minute + settings.repeat).toLong()).atZone(now.zone)
        return reminder.at == retry.toInstant().toEpochMilli()
    }

    fun allowed(data:HealthData,r:Reminder,now:ZonedDateTime):Boolean = data.settings.consent && when(r.kind) {
        "dose" -> data.doses.find { it.id==r.reference }?.let { dose ->
            data.medications.any { m -> m.id==dose.medicationId && m.matches(dose) } &&
                dose.status !in setOf(DoseStatus.TAKEN,DoseStatus.SKIPPED) &&
                r.at==dose.reminderAt(now.zone).toEpochMilli()
        } == true
        "water" -> waterAllowed(data,r,now)
        "appointment" -> data.appointments.any { it.id==r.reference && !it.cancelled && it.instant().isAfter(now.toInstant()) &&
            r.at in it.reminderTimes(data.settings) }
        "stock" -> data.medications.any { it.id==r.reference && data.lowStock(it,now) }
        else -> false
    }
}

private fun Medication.matches(dose:Dose):Boolean = Dose.on(this,LocalDateTime.parse(dose.wall).toLocalDate()).any {
    it.id==dose.id && it.milliUnits==dose.milliUnits && it.unit==dose.unit
}

fun Dose.quantityText():String = (actualMilliUnits ?: milliUnits)?.let { "${formatQuantity(it)} $unit" }.orEmpty()

fun MutableList<Appointment>.replace(appointment: Appointment) {
    removeAll { it.id == appointment.id };add(appointment)
}



/** Notification actions must still belong to the current, due reminder. */
fun HealthData.applyReminderAction(reminder: Reminder, action: String, now: ZonedDateTime): Boolean {
    if(action !in setOf("done","snooze") || reminder.kind !in setOf("dose","water") ||
        reminder.at>now.toInstant().toEpochMilli() || !Planner.allowed(this,reminder,now)) return false
    val token="${reminder.key}|${reminder.at}|$action"
    if(token in handledActions) return false
    when(reminder.kind) {
        "dose" -> doses.find {it.id==reminder.reference}?.let {
            mark(it,if(action=="done") DoseStatus.TAKEN else DoseStatus.SNOOZED,now.toInstant(),now.zone)
        } ?: return false
        "water" -> {
            if(action=="done") {addWater(250,now);waterAcknowledged+=reminder.waterBase;waterSnoozes.remove(reminder.waterBase)}
            else waterSnoozes[reminder.waterBase]=now.toInstant().plusSeconds(600).toEpochMilli()
        }
    }
    handledActions+=token
    if(handledActions.size>500) handledActions.removeAt(0)
    return true
}
