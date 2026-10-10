package ir.medora.health

import java.time.*
import java.nio.file.Files
import javax.crypto.KeyGenerator

object CoreChecks {
    @JvmStatic fun main(args:Array<String>) { println("${run()} checks passed") }
    fun run():Int {
        var checks=0
        fun expect(ok:Boolean,label:String) { check(ok){label};checks++ }
        fun rejects(label:String,block:()->Unit) { var failed=false;try{block()}catch(_:Exception){failed=true};expect(failed,label) }
        val zone=ZoneId.of("Asia/Tehran")
        val now=ZonedDateTime.of(2026,10,8,7,0,0,0,zone)
        val day=now.toLocalDate().toString()
        val d=HealthData(settings=Settings(consent=true,waterEnabled=true,repeat=10))
        d.addWater(250,now);d.addWater(500,now)
        expect(d.total(day)==750,"water sum")
        expect(d.remaining(day)==1250,"remaining")
        expect(d.progress(day)==.375f,"progress")
        val first=d.water.first();d.water[0]=first.copy(ml=400)
        expect(d.total(day)==900,"edit water")
        d.water.removeAt(0);expect(d.total(day)==500,"delete water")
        d.addWater(100,now.minusDays(1));expect(d.total(now.minusDays(1).toLocalDate().toString())==100,"history isolated")
        expect(d.total(day)==500,"today isolated")
        d.settings=d.settings.copy(goal=400);expect(d.remaining(day)==0 && d.progress(day)==1f,"goal clamping")
        d.settings=d.settings.copy(goal=2000)
        rejects("zero water rejected"){d.addWater(0,now)}
        expect(parseTimes("۰۸:۰۰، ١٤:٠٠، 08:00")==listOf("08:00","14:00"),"Persian Arabic input")
        expect(parseDates("۲۰۲۶-۱۰-۰۸،2026-10-09").size==2,"Persian dates")
        val m=Medication(id="medicine",name="نام واردشده",instructions="توضیح کاربر",startDay=day,times=listOf("08:00","20:00"))
        d.changeMedication(m,now)
        expect(d.dayDoses(day).size==2,"today materialization")
        expect(Planner.plan(d,now).count{it.kind=="dose"}==16,"multi-dose daily plan")
        val dose=d.dayDoses(day).first()
        d.mark(dose,DoseStatus.TAKEN,now.toInstant());expect(d.dayDoses(day).first().status==DoseStatus.TAKEN,"taken status")
        expect(Planner.plan(d,now).none{it.reference==dose.id},"taken cancels reminder")
        d.mark(dose,DoseStatus.SKIPPED,now.toInstant());expect(d.dayDoses(day).first().status==DoseStatus.SKIPPED,"skipped status")
        d.mark(dose,DoseStatus.SNOOZED,now.toInstant())
        expect(Planner.plan(d,now).single{it.reference==dose.id}.at==now.plusMinutes(10).toInstant().toEpochMilli(),"snooze ten minutes")
        d.mark(dose,DoseStatus.PENDING,now.toInstant());expect(d.dayDoses(day).first().snoozeUntil==0L,"reset status")
        val weekly=m.copy(id="weekly",weekdays=setOf(now.dayOfWeek.value))
        expect(weekly.occurs(now.toLocalDate()) && !weekly.occurs(now.plusDays(1).toLocalDate()),"weekdays")
        val dated=m.copy(id="dates",dates=setOf(now.plusDays(2).toLocalDate().toString()),weekdays=emptySet())
        expect(!dated.occurs(now.toLocalDate()) && dated.occurs(now.plusDays(2).toLocalDate()),"specific dates")
        d.changeMedication(m.copy(times=listOf("09:00")),now)
        expect(d.dayDoses(day).map{it.wall.substring(11)}==listOf("09:00"),"edit future dose slots")
        d.changeMedication(m.copy(times=listOf("09:00"),active=false),now)
        expect(Planner.plan(d,now).none{it.kind=="dose"},"paused medication cancels")
        d.changeMedication(m.copy(times=listOf("09:00")),now)
        d.mark(d.dayDoses(day).single(),DoseStatus.TAKEN,now.toInstant())
        d.deleteMedication(m.id,now)
        expect(d.dayDoses(day).single().status==DoseStatus.TAKEN,"delete retains completed history")
        expect(Planner.plan(d,now).none{it.kind=="dose"},"delete cancels schedule")
        val water=Planner.plan(d,now,1).filter{it.kind=="water"}
        expect(water.first().at==now.withHour(8).toInstant().toEpochMilli(),"water window start")
        expect(water.last().at==now.withHour(22).toInstant().toEpochMilli(),"water window end")
        expect(water.size==29,"one retry per slot within window")
        d.addWater(250,now.withHour(8).withMinute(2))
        expect(Planner.plan(d,now.withHour(8).withMinute(3),1).none{it.waterBase=="water|$day|480"},"water log suppresses retry")
        val base="water|$day|540";d.waterSnoozes[base]=now.withHour(9).withMinute(10).toInstant().toEpochMilli()
        expect(Planner.plan(d,now.withHour(9),1).single{it.waterBase==base}.at==d.waterSnoozes[base],"water snooze")
        d.settings=d.settings.copy(pauseUntil=now.withHour(12).toInstant().toEpochMilli())
        expect(Planner.plan(d,now,1).filter{it.kind=="water"}.all{it.at>=d.settings.pauseUntil},"temporary water pause")
        d.settings=d.settings.copy(waterEnabled=false)
        expect(Planner.plan(d,now).none{it.kind=="water"},"water disabled")
        d.settings=d.settings.copy(waterEnabled=true,pauseUntil=0,goal=500)
        expect(Planner.plan(d,now,1).none{it.kind=="water"},"reaching goal suppresses water")
        d.settings=d.settings.copy(goal=2000)
        val a=Appointment(id="visit",title="آزمایش",wall="2026-10-10T12:00",zone=zone.id,location="تهران",offsets=setOf(1440,60))
        d.appointments+=a
        expect(Planner.plan(d,now).count{it.kind=="appointment"}==4,"morning and advance appointment reminders")
        val travel=now.withZoneSameInstant(ZoneId.of("America/New_York"))
        expect(Planner.plan(d,now).filter{it.kind=="appointment"}.map{it.at}==Planner.plan(d,travel).filter{it.kind=="appointment"}.map{it.at},"clinic timezone preserved on travel")
        d.appointments[0]=a.copy(wall="2026-10-11T14:00")
        expect(Planner.plan(d,now).filter{it.kind=="appointment"}.last().at==d.appointments[0].instant().minusSeconds(3600).toEpochMilli(),"edit appointment reschedules")
        d.appointments[0]=a.copy(cancelled=true)
        expect(Planner.plan(d,now).none{it.kind=="appointment"},"cancel appointment")
        d.appointments.clear();expect(Planner.plan(d,now).none{it.kind=="appointment"},"delete appointment")
        val berlin=ZoneId.of("Europe/Berlin")
        val dstNow=ZonedDateTime.of(2026,3,28,7,0,0,0,berlin)
        val dst=HealthData(settings=Settings(consent=true),medications=mutableListOf(m.copy(startDay="2026-03-28",times=listOf("08:00"))))
        val slots=Planner.plan(dst,dstNow,2).filter{it.kind=="dose"}
        expect(Duration.ofMillis(slots[1].at-slots[0].at).toHours()==23L,"DST keeps eight o'clock local")
        expect(slots.all{Instant.ofEpochMilli(it.at).atZone(berlin).hour==8},"DST wall hour")
        val late=now.withHour(23).withMinute(58)
        val cross=HealthData(settings=Settings(consent=true),medications=mutableListOf(m.copy(times=listOf("23:55"))))
        cross.materialize(late);cross.mark(cross.dayDoses(day).single(),DoseStatus.SNOOZED,late.toInstant())
        expect(Planner.plan(cross,late.plusMinutes(3)).any{it.kind=="dose" && it.at==late.plusMinutes(10).toInstant().toEpochMilli()},"snooze across midnight")
        val n=d.notificationId("dose:x");expect(d.notificationId("dose:x")==n && d.notificationId("water:x")!=n,"stable unique ids")
        d.waterSnoozes["test"]=123456;d.handledActions+="action"
        d.validate()
        val restored=Codec.decode(Codec.encode(d));expect(restored==d,"all data codec round trip")
        val queue=Planner.plan(d,now);expect(Codec.decodeQueue(Codec.encodeQueue(queue))==queue,"queue round trip")
        rejects("unknown schema rejected"){Codec.decode(Codec.encode(d).replace("\"schema\":3","\"schema\":99"))}
        val key=KeyGenerator.getInstance("AES").apply{init(256)}.generateKey()
        val plain=Codec.encode(d).toByteArray(Charsets.UTF_8);val encrypted=Encryption.seal(plain,key)
        expect(!encrypted.contentEquals(plain),"data encrypted")
        expect(!encrypted.contentEquals(Encryption.seal(plain,key)),"fresh IV each write")
        val file=Files.createTempFile("medora-test-",".enc")
        try { Files.write(file,encrypted);expect(Codec.decode(String(Encryption.open(Files.readAllBytes(file),key),Charsets.UTF_8))==d,"encrypted file close reopen") } finally{Files.delete(file)}
        val tampered=encrypted.copyOf();tampered[tampered.lastIndex]=(tampered.last().toInt() xor 1).toByte()
        rejects("tampering detected"){Encryption.open(tampered,key)}
        rejects("wrong key rejected"){Encryption.open(encrypted,KeyGenerator.getInstance("AES").apply{init(256)}.generateKey())}
        d.settings=d.settings.copy(consent=false)
        expect(Planner.plan(d,now).isEmpty(),"no schedule before consent")
        expect(queue.none{Planner.allowed(d,it,now)},"revoked consent blocks queued delivery")
        expect(Planner.plan(HealthData(settings=Settings(consent=true)),now).single().kind=="maintenance","daily offline queue refresh")
        return checks
    }
}
