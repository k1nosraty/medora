package ir.medora.health

import org.json.JSONArray
import org.json.JSONObject

object Codec {
    private fun obj(vararg fields:Pair<String,Any?>)=JSONObject().apply { fields.forEach { put(it.first,it.second) } }
    private fun array(items:Iterable<*>)=JSONArray().apply { items.forEach { put(it) } }
    private fun JSONObject.list(key:String):List<JSONObject> = getJSONArray(key).let { a ->(0 until a.length()).map { a.getJSONObject(it) } }
    private fun JSONObject.strings(key:String):List<String> = getJSONArray(key).let { a ->(0 until a.length()).map { a.getString(it) } }
    private fun JSONObject.ints(key:String):Set<Int> = getJSONArray(key).let { a ->(0 until a.length()).map { a.getInt(it) }.toSet() }
    fun encode(d:HealthData):String = obj(
        "schema" to 5,"settings" to d.settings.let { s ->obj("goal" to s.goal,"waterEnabled" to s.waterEnabled,"start" to s.start,"end" to s.end,
            "interval" to s.interval,"repeat" to s.repeat,"pauseUntil" to s.pauseUntil,"consent" to s.consent,"private" to s.privateNotifications,
            "appointmentStart" to s.appointmentStart,"appointmentInterval" to s.appointmentInterval,
            "language" to s.language,"calendar" to s.calendar) },
        "water" to array(d.water.map { obj("id" to it.id,"ml" to it.ml,"day" to it.day,"at" to it.at) }),
        "medications" to array(d.medications.map { obj("id" to it.id,"name" to it.name,"instructions" to it.instructions,"startDay" to it.startDay,
            "times" to array(it.times),"weekdays" to array(it.weekdays),"dates" to array(it.dates),"active" to it.active,"effectiveFrom" to it.effectiveFrom) }),
        "doses" to array(d.doses.map { obj("id" to it.id,"medicationId" to it.medicationId,"name" to it.name,"instructions" to it.instructions,
            "wall" to it.wall,"status" to it.status.name,"snoozeUntil" to it.snoozeUntil,"updatedAt" to it.updatedAt) }),
        "appointments" to array(d.appointments.map { obj("id" to it.id,"title" to it.title,"wall" to it.wall,"zone" to it.zone,
            "location" to it.location,"notes" to it.notes,"contact" to it.contact,"offsets" to array(it.offsets),"cancelled" to it.cancelled) }),
        "acknowledged" to array(d.waterAcknowledged),"snoozes" to JSONObject(d.waterSnoozes as Map<*,*>),
        "handled" to array(d.handledActions),"through" to d.through,"nextNotificationId" to d.nextNotificationId,
        "notificationIds" to JSONObject(d.notificationIds as Map<*,*>),
        "reminderCheckpoint" to d.reminderCheckpoint,"deliveredReminders" to JSONObject(d.deliveredReminders as Map<*,*>)
    ).toString()
    fun decode(text:String):HealthData {
        val j=JSONObject(text);val schema=j.getInt("schema");require(schema in 2..5) { "نسخه اطلاعات پشتیبانی نمی‌شود" }
        val s=j.getJSONObject("settings")
        val d=HealthData(settings=Settings(s.getInt("goal"),s.getBoolean("waterEnabled"),s.getString("start"),s.getString("end"),
            s.getInt("interval"),s.getInt("repeat"),s.getLong("pauseUntil"),s.getBoolean("consent"),
            s.optBoolean("private",false),s.optString("appointmentStart","08:00"),
            s.optInt("appointmentInterval",120),s.optString("language","fa"),s.optString("calendar","jalali")),through=j.getString("through"))
        j.list("water").forEach { d.water += Water(it.getString("id"),it.getInt("ml"),it.getString("day"),it.getLong("at")) }
        j.list("medications").forEach { d.medications += Medication(it.getString("id"),it.getString("name"),it.getString("instructions"),
            it.getString("startDay"),it.strings("times"),it.ints("weekdays"),it.strings("dates").toSet(),it.getBoolean("active"),it.optLong("effectiveFrom",0)) }
        j.list("doses").forEach { d.doses += Dose(it.getString("id"),it.getString("medicationId"),it.getString("name"),it.getString("instructions"),
            it.getString("wall"),DoseStatus.valueOf(it.getString("status")),it.getLong("snoozeUntil"),it.getLong("updatedAt")) }
        j.list("appointments").forEach { d.appointments += Appointment(it.getString("id"),it.getString("title"),it.getString("wall"),it.getString("zone"),
            it.getString("location"),it.getString("notes"),it.getString("contact"),it.ints("offsets"),it.getBoolean("cancelled")) }
        d.waterAcknowledged += j.strings("acknowledged");d.handledActions += j.strings("handled")
        j.getJSONObject("snoozes").let { map ->map.keys().forEach { d.waterSnoozes[it]=map.getLong(it) } }
        j.getJSONObject("notificationIds").let { map ->map.keys().forEach { d.notificationIds[it]=map.getInt(it) } }
        d.reminderCheckpoint=j.optLong("reminderCheckpoint",0)
        j.optJSONObject("deliveredReminders")?.let { map ->map.keys().forEach { d.deliveredReminders[it]=map.getLong(it) } }
        d.nextNotificationId=j.getInt("nextNotificationId");d.validate();return d
    }
    fun encodeQueue(q:List<Reminder>)=array(q.map { obj("key" to it.key,"kind" to it.kind,"reference" to it.reference,
        "at" to it.at,"title" to it.title,"body" to it.body,"waterBase" to it.waterBase) }).toString()
    fun decodeQueue(text:String):List<Reminder> = JSONArray(text).let { a ->(0 until a.length()).map { i -> a.getJSONObject(i).let {
        Reminder(it.getString("key"),it.getString("kind"),it.getString("reference"),it.getLong("at"),it.getString("title"),it.getString("body"),it.getString("waterBase"))
    } } }
}
