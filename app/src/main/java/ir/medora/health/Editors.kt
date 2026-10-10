package ir.medora.health

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.*

@OptIn(ExperimentalLayoutApi::class)
@Composable fun EditDialog(e:Editor,vm:HealthViewModel,close:()->Unit,requestPermission:()->Unit,openNotifications:()->Unit,openExact:()->Unit) {
    if(e.kind=="settings") {
        SettingsDialog(vm,close,requestPermission,openNotifications,openExact)
        return
    }
    val data=vm.data?:return
    val context=LocalContext.current
    val initialTime=remember { when {
        e.water!=null->LocalDate.parse(e.water.day).atTime(Instant.ofEpochMilli(e.water.at).atZone(ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0))
        e.appointment!=null->LocalDateTime.parse(e.appointment.wall)
        else->LocalDateTime.now().plusDays(if(e.kind=="appointment")1 else 0).withSecond(0).withNano(0)
    } }
    var dateTime by remember { mutableStateOf(initialTime) }
    var name by remember { mutableStateOf(e.medication?.name?:e.appointment?.title?:"") }
    var instructions by remember { mutableStateOf(e.medication?.instructions?:"") }
    var times by remember { mutableStateOf(e.medication?.times?.takeIf { it.isNotEmpty() }?:listOf("08:00")) }
    var dates by remember { mutableStateOf(e.medication?.dates?.joinToString(", ")?:"") }
    var specific by remember { mutableStateOf(e.medication?.dates?.isNotEmpty()?:false) }
    var weekdays by remember { mutableStateOf(e.medication?.weekdays?:(1..7).toSet()) }
    var amount by remember { mutableStateOf((e.water?.ml?:250).toString()) }
    var zone by remember { mutableStateOf(e.appointment?.zone?:ZoneId.systemDefault().id) }
    var location by remember { mutableStateOf(e.appointment?.location?:"") }
    var contact by remember { mutableStateOf(e.appointment?.contact?:"") }
    var notes by remember { mutableStateOf(e.appointment?.notes?:"") }
    var offsets by remember { mutableStateOf(e.appointment?.offsets?.filter { it>0 }?.toSet()?:setOf(60)) }
    var error by remember { mutableStateOf<String?>(null) }
    val title=when(e.kind){"water"->if(e.water==null)"ثبت آب" else "ویرایش ثبت آب";"medication"->if(e.medication==null)"داروی جدید" else "ویرایش دارو";"appointment"->if(e.appointment==null)"قرار جدید" else "ویرایش قرار";else->context.getString(R.string.settings_title)}
    fun datePicker() {
        DatePickerDialog(context,{_,y,m,d->dateTime=LocalDate.of(y,m+1,d).atTime(dateTime.toLocalTime())},dateTime.year,dateTime.monthValue-1,dateTime.dayOfMonth)
            .apply { if(e.kind=="water")datePicker.maxDate=System.currentTimeMillis() }.show()
    }
    fun timePicker() { TimePickerDialog(context,{_,h,m->dateTime=dateTime.toLocalDate().atTime(h,m)},dateTime.hour,dateTime.minute,true).show() }
    fun medicationTimePicker(index:Int?=null) {
        val initial=LocalTime.parse(if(index==null)times.last() else times[index])
        TimePickerDialog(context,{_,h,m->
            val selected=LocalTime.of(h,m).toString()
            if(times.withIndex().any { it.index!=index && it.value==selected }) {
                error="این ساعت مصرف قبلاً اضافه شده است"
            } else {
                times=if(index==null)times+selected else times.mapIndexed { i,time->if(i==index)selected else time }
                error=null
            }
        },initial.hour,initial.minute,true).show()
    }
    fun save() {
        try {
            error=null
            val mutation:(HealthData)->Unit=when(e.kind) {
                "water"->{
                    val ml=normalize(amount).toInt();require(ml in 1..10000){"از ۱ تا ۱۰۰۰۰ میلی‌لیتر وارد کنید"}
                    val whenAt=dateTime.atZone(ZoneId.systemDefault());require(!whenAt.toInstant().isAfter(Instant.now())){"زمان آب نمی‌تواند در آینده باشد"}
                    val action: (HealthData)->Unit = { d:HealthData->if(e.water==null)d.addWater(ml,whenAt) else {
                        d.water.removeAll { it.id==e.water.id };d.water+=e.water.copy(ml=ml,day=dateTime.toLocalDate().toString(),at=whenAt.toInstant().toEpochMilli())
                    } }; action
                }
                "medication"->{
                    val parsedTimes=parseTimes(times.joinToString(","));val parsedDates=if(specific)parseDates(dates) else emptySet()
                    require(name.isNotBlank()){ "نام دارو را وارد کنید" }
                    require(if(specific)parsedDates.isNotEmpty() else weekdays.isNotEmpty()){ "حداقل یک روز یا تاریخ انتخاب کنید" }
                    val med=Medication(id=e.medication?.id?:id(),name=name.trim(),instructions=instructions.trim(),startDay=e.medication?.startDay?:LocalDate.now().toString(),
                        times=parsedTimes,weekdays=if(specific)emptySet() else weekdays,dates=parsedDates,active=e.medication?.active?:true)
                    val action: (HealthData)->Unit = { d:HealthData->d.changeMedication(med,ZonedDateTime.now()) }; action
                }
                "appointment"->{
                    require(name.isNotBlank()){ "عنوان قرار را وارد کنید" };ZoneId.of(zone.trim())
                    val a=Appointment(id=e.appointment?.id?:id(),title=name.trim(),wall=dateTime.toString(),zone=zone.trim(),location=location.trim(),contact=contact.trim(),notes=notes.trim(),offsets=offsets,cancelled=e.appointment?.cancelled?:false)
                    require(e.appointment!=null || a.instant().isAfter(Instant.now())){"قرار جدید باید در آینده باشد"}
                    val action: (HealthData)->Unit = { d:HealthData->d.appointments.replace(a) }; action
                }
                else->throw IllegalArgumentException("نوع فرم معتبر نیست")
            }
            vm.change(mutation,close)
        } catch(ex:Exception) { error=if(ex is NumberFormatException || ex is java.time.DateTimeException)"ورودی را بررسی کنید؛ ساعت مانند 08:00 و تاریخ میلادی است." else ex.message?:"اطلاعات کامل نیست" }
    }
    Dialog(onDismissRequest={if(!vm.busy)close()},properties=DialogProperties(usePlatformDefaultWidth=false)) {
        Surface(shape=androidx.compose.foundation.shape.RoundedCornerShape(24.dp),modifier=Modifier.padding(16.dp).widthIn(max=620.dp).fillMaxWidth()) {
            Column(Modifier.heightIn(max=LocalContext.current.resources.displayMetrics.heightPixels.dp/LocalContext.current.resources.displayMetrics.density*.85f)
                .imePadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Text(title,style=MaterialTheme.typography.titleLarge)
                when(e.kind) {
                    "water"->{Input(amount,{amount=it},"مقدار به میلی‌لیتر");OutlinedButton(onClick={datePicker()}){Text(labelDate(dateTime.toLocalDate()))};OutlinedButton(onClick={timePicker()}){Text(fa(dateTime.toLocalTime()))} }
                    "medication"->{
                        Input(name,{name=it},"نام دارو یا مکمل");Input(instructions,{instructions=it},"مقدار یا توضیح مصرف")
                        Text("ساعت‌های مصرف",style=MaterialTheme.typography.titleSmall)
                        times.forEachIndexed { index,time->
                            Row(Modifier.fillMaxWidth(),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) {
                                OutlinedButton(onClick={medicationTimePicker(index)},modifier=Modifier.weight(1f)) {
                                    Text("ساعت مصرف ${fa(index+1)}: ${fa(time)}")
                                }
                                if(times.size>1)IconButton(onClick={times=times.filterIndexed { i,_->i!=index };error=null}) {
                                    Icon(Icons.Default.Delete,contentDescription="حذف ساعت مصرف ${fa(index+1)}")
                                }
                            }
                        }
                        TextButton(onClick={medicationTimePicker()},enabled=times.size<12) {
                            Icon(Icons.Default.Add,contentDescription=null)
                            Spacer(Modifier.width(8.dp))
                            Text("افزودن ساعت مصرف")
                        }
                        SwitchRow("مصرف در تاریخ‌های مشخص",specific){specific=it}
                        if(specific)Input(dates,{dates=it},"تاریخ‌های مصرف","میلادی؛ مثال: 2026-10-09, 2026-10-15")
                        else FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)) { weekDays.forEach { (day,label)->
                            FilterChip(selected=day in weekdays,onClick={weekdays=if(day in weekdays)weekdays-day else weekdays+day},label={Text(label)})
                        } }
                        Text("نام و دستور مصرف را خودتان وارد می‌کنید؛ برنامه توصیه پزشکی نمی‌دهد.")
                    }
                    "appointment"->{
                        Input(name,{name=it},"نام پزشک یا عنوان قرار")
                        OutlinedButton(onClick={datePicker()}){Text(labelDate(dateTime.toLocalDate()))};OutlinedButton(onClick={timePicker()}){Text(fa(dateTime.toLocalTime()))}
                        Input(zone,{zone=it},"منطقه زمانی محل قرار","مثال: Asia/Tehran — ساعت قرار به این منطقه وابسته است")
                        Input(location,{location=it},"مکان");Input(contact,{contact=it},"اطلاعات تماس");Input(notes,{notes=it},"توضیحات")
                        Text("یادآوری از ساعت ${fa(data.settings.appointmentStart)} روز قرار، هر ${fa(data.settings.appointmentInterval/60)} ساعت تا پیش از نوبت")
                        Text("یادآوری زودتر (اختیاری)",style=MaterialTheme.typography.titleSmall)
                        FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            (listOf(60,120,1440)+offsets).distinct().sorted().forEach { n ->
                                FilterChip(selected=n in offsets,onClick={offsets=if(n in offsets)offsets-n else offsets+n},
                                    label={Text(when(n){60->"۱ ساعت قبل";120->"۲ ساعت قبل";1440->"روز قبل";else->"${fa(n)} دقیقه قبل"})})
                            }
                        }
                    }
                }
                (error?:vm.error)?.let { Text(it,color=MaterialTheme.colorScheme.error) }
                Button(onClick={save()},enabled=!vm.busy,modifier=Modifier.fillMaxWidth()){Text(if(vm.busy)"در حال ذخیره…" else "ذخیره")}
                TextButton(onClick=close,enabled=!vm.busy,modifier=Modifier.fillMaxWidth()){Text("انصراف")}
            }
        }
    }
}
@Composable fun Input(value:String,change:(String)->Unit,label:String,helper:String="") {
    OutlinedTextField(value=value,onValueChange=change,label={Text(label)},supportingText=if(helper.isNotEmpty())({Text(helper)})else null,modifier=Modifier.fillMaxWidth())
}
@Composable fun SwitchRow(label:String,checked:Boolean,change:(Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){Text(label,Modifier.weight(1f));Switch(checked=checked,onCheckedChange=change)}
}
