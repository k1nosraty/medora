package ir.hamrah.health

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.Context
import android.content.res.Configuration
import java.util.Locale
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.*
import androidx.compose.ui.text.font.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.*
import java.time.*

val Green=Color(0xFF176B58)
val Blue=Color(0xFF2775A4)
val Ink=Color(0xFF183A34)
val PersianFont=FontFamily(Font(R.font.vazirmatn))
fun fa(value:Any)=value.toString().map { if(it in '0'..'9') "۰۱۲۳۴۵۶۷۸۹"[it-'0'] else it }.joinToString("")
fun labelDate(day:LocalDate)=fa(day.toString().replace('-','/'))
fun statusLabel(s:DoseStatus)=when(s) { DoseStatus.PENDING->"در انتظار";DoseStatus.TAKEN->"مصرف شد";DoseStatus.SNOOZED->"به تعویق افتاده";DoseStatus.SKIPPED->"مصرف نشد" }
val weekDays=linkedMapOf(6 to "شنبه",7 to "یکشنبه",1 to "دوشنبه",2 to "سه‌شنبه",3 to "چهارشنبه",4 to "پنجشنبه",5 to "جمعه")

class MainActivity:ComponentActivity() {
    private lateinit var model:HealthViewModel
    private val permission=registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        model.change({ it.settings=it.settings.copy(consent=granted) })
    }
    override fun attachBaseContext(base:Context) {
        val config=Configuration(base.resources.configuration).apply { setLocale(Locale("fa"));setLayoutDirection(Locale("fa")) }
        super.attachBaseContext(base.createConfigurationContext(config))
    }
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        model=ViewModelProvider(this)[HealthViewModel::class.java]
        setContent {
            val base=Typography()
            val typography=Typography(
                displayLarge=base.displayLarge.copy(fontFamily=PersianFont),
                headlineLarge=base.headlineLarge.copy(fontFamily=PersianFont),headlineMedium=base.headlineMedium.copy(fontFamily=PersianFont),
                titleLarge=base.titleLarge.copy(fontFamily=PersianFont),titleMedium=base.titleMedium.copy(fontFamily=PersianFont),
                titleSmall=base.titleSmall.copy(fontFamily=PersianFont),bodyLarge=base.bodyLarge.copy(fontFamily=PersianFont),
                bodyMedium=base.bodyMedium.copy(fontFamily=PersianFont),bodySmall=base.bodySmall.copy(fontFamily=PersianFont),
                labelLarge=base.labelLarge.copy(fontFamily=PersianFont),labelMedium=base.labelMedium.copy(fontFamily=PersianFont),labelSmall=base.labelSmall.copy(fontFamily=PersianFont)
            )
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(colorScheme=lightColorScheme(primary=Green,secondary=Blue,background=Color(0xFFF5F8F5),onBackground=Ink),typography=typography) {
                    HealthScreen(model,::requestNotifications,::openNotificationSettings,::openExactSettings)
                }
            }
        }
    }
    override fun onResume() { super.onResume();if(::model.isInitialized && !model.busy)model.refresh() }
    private fun requestNotifications() {
        if(Build.VERSION.SDK_INT>=33)permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        else model.change({ it.settings=it.settings.copy(consent=true) })
    }
    private fun openNotificationSettings()=startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE,packageName))
    private fun openExactSettings() {
        if(Build.VERSION.SDK_INT>=31)startActivity(Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:$packageName")))
    }
}
data class Editor(val kind:String,val water:Water?=null,val medication:Medication?=null,val appointment:Appointment?=null)

@Composable fun Panel(color:Color=Color.White,content:@Composable ColumnScope.()->Unit) {
    Surface(shape=RoundedCornerShape(24.dp),color=color,border=BorderStroke(1.dp,Color(0xFFE2EAE4)),modifier=Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp),content=content)
    }
}
@Composable fun Heading(text:String) { Text(text,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=12.dp)) }
@Composable fun Empty(text:String) { Panel { Text(text,color=Green) } }
@Composable fun Gap()=Spacer(Modifier.height(10.dp))
@OptIn(ExperimentalMaterial3Api::class,ExperimentalLayoutApi::class)
@Composable fun HealthScreen(vm:HealthViewModel,requestPermission:()->Unit,openNotification:()->Unit,openExact:()->Unit) {
    val d=vm.data
    var tab by rememberSaveableState(0)
    var history by remember { mutableStateOf(LocalDate.now()) }
    var editor by remember { mutableStateOf<Editor?>(null) }
    var deletion by remember { mutableStateOf<Pair<String,(HealthData)->Unit>?>(null) }
    val context=LocalContext.current
    if(d==null) {
        Box(Modifier.fillMaxSize().padding(24.dp),contentAlignment=Alignment.Center) {
            if(vm.error==null)CircularProgressIndicator() else Column { Text(vm.error!!);Button(onClick=vm::refresh){Text("تلاش دوباره")} }
        };return
    }
    fun selectHistory() {
        DatePickerDialog(context,{_,y,m,day->history=LocalDate.of(y,m+1,day)},history.year,history.monthValue-1,history.dayOfMonth)
            .apply { datePicker.maxDate=System.currentTimeMillis() }.show()
    }
    Scaffold(
        topBar={TopAppBar(title={Row(verticalAlignment=Alignment.CenterVertically) { Icon(Icons.Default.Spa,null,tint=Green);Spacer(Modifier.width(8.dp));Text("همراه",fontWeight=FontWeight.Bold) }},
            actions={IconButton(onClick={editor=Editor("settings")}){Icon(Icons.Default.Tune,"تنظیمات")}})},
        bottomBar={NavigationBar { listOf("امروز" to Icons.Default.Dashboard,"آب" to Icons.Default.WaterDrop,"داروها" to Icons.Default.Medication,"قرارها" to Icons.Default.CalendarMonth).forEachIndexed { i,pair ->
            NavigationBarItem(selected=tab==i,onClick={tab=i},icon={Icon(pair.second,null)},label={Text(pair.first)})
        } } }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding),horizontalAlignment=Alignment.CenterHorizontally) {
            if(vm.busy)LinearProgressIndicator(Modifier.fillMaxWidth())
            Column(Modifier.widthIn(max=760.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                vm.error?.let { Panel(Color(0xFFFFF1D9)){Text(it)} }
                if(!d.settings.consent || !vm.enabled)Panel(Color(0xFFEAF3ED)) {
                    Text("یادآوری‌ها به اجازه شما نیاز دارند",fontWeight=FontWeight.Bold)
                    Text("برای یادآوری هنگام بسته‌بودن برنامه، اعلان‌ها را فعال کنید.")
                    FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { Button(onClick=requestPermission){Text("فعال‌کردن اعلان‌ها")};TextButton(onClick=openNotification){Text("تنظیمات گوشی")} }
                }
                when(tab) {
                    0 -> {
                        Text("${weekDays[LocalDate.now().dayOfWeek.value]}، ${labelDate(LocalDate.now())}",color=Green)
                        Text("هر روز، کمی مراقبت",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
                        Text("آب، دارو و قرارهای شما؛ همه در یک جا.")
                        WaterSummary(d,LocalDate.now()) { ml->vm.change({it.addWater(ml,ZonedDateTime.now())}) }
                        FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                            Button(onClick={editor=Editor("water")}){Icon(Icons.Default.Add,null);Text("ثبت آب")}
                            OutlinedButton(onClick={editor=Editor("medication")}){Text("داروی جدید")}
                            OutlinedButton(onClick={editor=Editor("appointment")}){Text("قرار جدید")}
                        }
                        Heading("داروهای امروز")
                        val doses=d.dayDoses(LocalDate.now().toString())
                        if(doses.isEmpty())Empty("دارویی برای امروز ثبت نشده است")
                        doses.forEach { dose->DoseCard(dose,vm) }
                        Heading("در پیش دارید")
                        vm.next?.let { r->Panel { Text(r.title,fontWeight=FontWeight.Bold);Text(fa(Instant.ofEpochMilli(r.at).atZone(ZoneId.systemDefault()).toLocalDateTime().toString().replace('T',' '))) } }
                        val nearest=d.appointments.filter { !it.cancelled && it.instant().isAfter(Instant.now()) }.minByOrNull { it.instant() }
                        if(nearest!=null)AppointmentCard(nearest,{editor=Editor("appointment",appointment=nearest)},
                            {vm.change({data->data.appointments.replace(nearest.copy(cancelled=!nearest.cancelled))})},
                            {deletion="این قرار حذف شود؟" to { data->data.appointments.removeAll{it.id==nearest.id} }})
                        if(vm.next==null && nearest==null)Empty("یادآوری یا قرار آینده‌ای ندارید")
                    }
                    1 -> {
                        Heading("آب و سوابق")
                        OutlinedButton(onClick={selectHistory()}) { Icon(Icons.Default.History,null);Text(labelDate(history)) }
                        WaterSummary(d,history) { ml->vm.change({it.addWater(ml,ZonedDateTime.of(history,LocalTime.now(),ZoneId.systemDefault()))}) }
                        Button(onClick={editor=Editor("water")}){Text("ثبت مقدار دلخواه")}
                        val entries=d.water.filter { it.day==history.toString() }.sortedByDescending { it.at }
                        if(entries.isEmpty())Empty("در این روز آبی ثبت نشده است")
                        entries.forEach { w->Panel {
                            Row(verticalAlignment=Alignment.CenterVertically) {
                                Icon(Icons.Default.WaterDrop,null,tint=Blue);Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)){Text("${fa(w.ml)} میلی‌لیتر",fontWeight=FontWeight.Bold);Text(fa(Instant.ofEpochMilli(w.at).atZone(ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0)))}
                                IconButton(onClick={editor=Editor("water",water=w)}){Icon(Icons.Default.Edit,"ویرایش ثبت آب")}
                                IconButton(onClick={deletion="این ثبت آب حذف شود؟" to { it.water.removeAll { e->e.id==w.id } }}){Icon(Icons.Default.DeleteOutline,"حذف ثبت آب")}
                            }
                        } }
                    }
                    2 -> {
                        Heading("برنامه داروها")
                        Button(onClick={editor=Editor("medication")}){Text("داروی جدید")}
                        if(d.medications.isEmpty())Empty("برنامه دارویی ثبت نشده است")
                        d.medications.forEach { med->Panel {
                            Row(verticalAlignment=Alignment.CenterVertically) {
                                Text(med.name,Modifier.weight(1f),style=MaterialTheme.typography.titleLarge)
                                Switch(checked=med.active,onCheckedChange={active->vm.change({it.changeMedication(med.copy(active=active),ZonedDateTime.now())})})
                            }
                            if(med.instructions.isNotEmpty())Text(med.instructions)
                            Text(med.times.joinToString(" • "){fa(it)})
                            Text(if(med.dates.isNotEmpty())med.dates.joinToString("، "){fa(it)} else med.weekdays.joinToString("، "){weekDays[it].orEmpty()})
                            Row {
                                TextButton(onClick={editor=Editor("medication",medication=med)}){Text("ویرایش")}
                                TextButton(onClick={deletion="برنامه حذف شود؟ سوابق مصرف حفظ می‌شوند." to {it.deleteMedication(med.id,ZonedDateTime.now())}}){Text("حذف")}
                            }
                        } }
                        Heading("سوابق و وضعیت مصرف")
                        OutlinedButton(onClick={selectHistory()}){Text(labelDate(history))}
                        val doses=d.dayDoses(history.toString());if(doses.isEmpty())Empty("نوبتی برای این روز وجود ندارد")
                        doses.forEach { DoseCard(it,vm) }
                    }
                    3 -> {
                        Heading("قرارهای پزشکی");Button(onClick={editor=Editor("appointment")}){Text("قرار جدید")}
                        val future=d.appointments.filter { !it.cancelled && !it.instant().isBefore(Instant.now()) }.sortedBy { it.instant() }
                        val past=d.appointments.filter { it.cancelled || it.instant().isBefore(Instant.now()) }.sortedByDescending { it.instant() }
                        if(future.isEmpty())Empty("قرار آینده‌ای ثبت نشده است")
                        (future+past).forEachIndexed { i,a->
                            if(i==future.size && past.isNotEmpty())Heading("گذشته و لغوشده")
                            AppointmentCard(a,{editor=Editor("appointment",appointment=a)},
                                {vm.change({it.appointments.replace(a.copy(cancelled=!a.cancelled))})},
                                {deletion="این قرار حذف شود؟" to {it.appointments.removeAll{v->v.id==a.id}}})
                        }
                    }
                }
            }
        }
    }
    deletion?.let { pair->AlertDialog(onDismissRequest={deletion=null},title={Text("حذف")},text={Text(pair.first)},
        confirmButton={Button(onClick={vm.change(pair.second){deletion=null}},enabled=!vm.busy){Text("حذف")}},
        dismissButton={TextButton(onClick={deletion=null}){Text("انصراف")}}) }
    editor?.let { e->key(e) { EditDialog(e,vm,{editor=null},requestPermission,openNotification,openExact) } }
}
// Primitive navigation state survives Activity recreation without retaining Context.
@Composable fun rememberSaveableState(initial:Int)=androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(initial) }
fun MutableList<Appointment>.replace(a:Appointment) { removeAll{it.id==a.id};add(a) }

@OptIn(ExperimentalLayoutApi::class)
@Composable fun WaterSummary(d:HealthData,day:LocalDate,add:(Int)->Unit) {
    Panel(Color(0xFFEAF4F8)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text("آب روزانه",fontWeight=FontWeight.Bold);Text("${fa((d.progress(day.toString())*100).toInt())}٪",color=Blue) }
        Text("${fa(d.total(day.toString()))} از ${fa(d.settings.goal)} میلی‌لیتر",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
        LinearProgressIndicator(progress={d.progress(day.toString())},modifier=Modifier.fillMaxWidth(),color=Blue)
        Text("${fa(d.remaining(day.toString()))} میلی‌لیتر تا هدف فعلی")
        FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf(150,250,500).forEach{ml->FilledTonalButton(onClick={add(ml)}){Text("+ ${fa(ml)}")}}}
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable fun DoseCard(dose:Dose,vm:HealthViewModel) {
    var menu by remember { mutableStateOf(false) }
    Panel {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(if(dose.status==DoseStatus.TAKEN)Icons.Default.CheckCircle else Icons.Default.Medication,null,tint=Green)
            Spacer(Modifier.width(8.dp));Text(dose.name,Modifier.weight(1f),fontWeight=FontWeight.Bold)
            Text(fa(dose.wall.substring(11)))
            Box { IconButton(onClick={menu=true}){Icon(Icons.Default.MoreVert,"تغییر وضعیت")}
                DropdownMenu(expanded=menu,onDismissRequest={menu=false}){DoseStatus.entries.forEach { status->
                    DropdownMenuItem(text={Text(statusLabel(status))},onClick={vm.change({it.mark(dose,status,Instant.now())});menu=false})
                }} }
        }
        if(dose.instructions.isNotEmpty())Text(dose.instructions)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            AssistChip(onClick={menu=true},label={Text(statusLabel(dose.status))})
            if(dose.status==DoseStatus.PENDING || dose.status==DoseStatus.SNOOZED) {
                TextButton(onClick={vm.change({it.mark(dose,DoseStatus.TAKEN,Instant.now())})}){Text("مصرف کردم")}
                TextButton(onClick={vm.change({it.mark(dose,DoseStatus.SNOOZED,Instant.now())})}){Text("۱۰ دقیقه بعد")}
            }
        }
        if(dose.status==DoseStatus.SNOOZED)Text("تا ${fa(Instant.ofEpochMilli(dose.snoozeUntil).atZone(ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0))}")
    }
}
@Composable fun AppointmentCard(a:Appointment,edit:()->Unit,toggle:()->Unit,delete:()->Unit) {
    Panel {
        Text(a.title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
        Text("${fa(a.wall.replace('T',' '))} • ${a.zone}")
        if(a.cancelled)Text("لغو شده",color=Color(0xFF9B3E2C))
        if(a.location.isNotEmpty())Text("مکان: ${a.location}")
        if(a.contact.isNotEmpty())Text("تماس: ${a.contact}")
        if(a.notes.isNotEmpty())Text(a.notes)
        Text("یادآوری: ${a.offsets.sortedDescending().joinToString("، "){"${fa(it)} دقیقه قبل"}}")
        Row { TextButton(onClick=edit){Text("ویرایش")};TextButton(onClick=toggle){Text(if(a.cancelled)"فعال‌کردن" else "لغو قرار")};TextButton(onClick=delete){Text("حذف")} }
    }
}
