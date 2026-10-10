package ir.medora.health

import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.Instant
import java.time.LocalTime

@OptIn(ExperimentalLayoutApi::class)
@Composable fun SettingsDialog(vm:HealthViewModel,close:()->Unit,requestPermission:()->Unit,openNotifications:()->Unit,openExact:()->Unit) {
    val data=vm.data?:return
    val initial=remember { data.settings }
    var goal by remember { mutableStateOf(initial.goal.toString()) }
    var waterEnabled by remember { mutableStateOf(initial.waterEnabled) }
    var start by remember { mutableStateOf(initial.start) }
    var end by remember { mutableStateOf(initial.end) }
    var interval by remember { mutableStateOf(initial.interval) }
    var repeat by remember { mutableStateOf(initial.repeat) }
    var pause by remember { mutableStateOf(initial.pauseUntil) }
    var appointmentStart by remember { mutableStateOf(initial.appointmentStart) }
    var appointmentInterval by remember { mutableStateOf(initial.appointmentInterval) }
    var showDetails by remember { mutableStateOf(!initial.privateNotifications) }
    var tab by remember { mutableIntStateOf(0) }
    var advanced by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scroll=rememberScrollState()
    LaunchedEffect(tab) { scroll.scrollTo(0) }
    fun save() {
        try {
            val settings=initial.copy(goal=normalize(goal).toInt(),waterEnabled=waterEnabled,start=start,end=end,
                interval=interval,repeat=repeat,pauseUntil=pause,privateNotifications=!showDetails,
                appointmentStart=appointmentStart,appointmentInterval=appointmentInterval)
            require(settings.goal in 1..20000) { "هدف آب باید از ۱ تا ۲۰۰۰۰ میلی‌لیتر باشد" }
            require(LocalTime.parse(start)<LocalTime.parse(end)) { "ساعت شروع باید قبل از ساعت پایان باشد" }
            error=null
            vm.change({ it.settings=settings.copy(consent=it.settings.consent) },close)
        } catch(_:NumberFormatException) { error="هدف آب را به‌صورت عدد وارد کنید" }
        catch(ex:IllegalArgumentException) { error=ex.message }
    }
    Dialog(onDismissRequest={if(!vm.busy)close()},properties=DialogProperties(usePlatformDefaultWidth=false)) {
        val context=LocalContext.current
        val maxHeight=(context.resources.displayMetrics.heightPixels/context.resources.displayMetrics.density*.88f).dp
        Surface(shape=androidx.compose.foundation.shape.RoundedCornerShape(28.dp),color=MaterialTheme.colorScheme.background,
            modifier=Modifier.padding(16.dp).widthIn(max=560.dp).fillMaxWidth()) {
            Column(Modifier.heightIn(max=maxHeight).imePadding().padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.settings_title),style=MaterialTheme.typography.titleLarge)
                        Text("یادآوری‌ها مطابق روز شما",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick=close,enabled=!vm.busy) { Icon(Icons.Default.Close,"بستن تنظیمات") }
                }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    listOf("آب","قرارها","اعلان‌ها").forEachIndexed { i,label ->
                        val selected=tab==i
                        Surface(color=if(selected)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                            contentColor=if(selected)MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                            shape=androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                            border=if(selected)null else BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant),
                            modifier=Modifier.weight(1f).selectable(selected=selected,role=Role.Tab,onClick={tab=i})) {
                            Box(Modifier.heightIn(min=48.dp).padding(8.dp),contentAlignment=Alignment.Center) {
                                Text(label,maxLines=1,style=MaterialTheme.typography.labelLarge)
                            }
                        }
                    }
                }
                Column(Modifier.weight(1f,false).verticalScroll(scroll),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                    when(tab) {
                        0 -> {
                            Panel {
                                Text("هدف روزانه آب",style=MaterialTheme.typography.titleMedium)
                                OutlinedTextField(value=fa(goal),onValueChange={goal=normalize(it)},singleLine=true,
                                    label={Text("مقدار دلخواه شما")},suffix={Text("میلی‌لیتر")},
                                    keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.fillMaxWidth())
                            }
                            Panel {
                                SwitchRow("یادآوری نوشیدن آب",waterEnabled) { waterEnabled=it }
                                if(waterEnabled) {
                                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                        TimeSetting("از ساعت",start,{start=it},Modifier.weight(1f))
                                        TimeSetting("تا ساعت",end,{end=it},Modifier.weight(1f))
                                    }
                                    Text("فاصله یادآوری‌ها",style=MaterialTheme.typography.bodyMedium)
                                    FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                        (listOf(30,60,120)+interval).distinct().sorted().forEach { n ->
                                            FilterChip(selected=interval==n,onClick={interval=n;if(repeat>=n)repeat=0},
                                                label={Text(if(n<60)"${fa(n)} دقیقه" else if(n==60)"۱ ساعت" else if(n==120)"۲ ساعت" else "${fa(n)} دقیقه")})
                                        }
                                    }
                                    TextButton(onClick={advanced=!advanced}) {
                                        Text("گزینه‌های بیشتر")
                                        Icon(if(advanced)Icons.Default.ExpandLess else Icons.Default.ExpandMore,null)
                                    }
                                    if(advanced) {
                                        Text("اگر آب ثبت نشد، یک بار دیگر یادآوری کن",style=MaterialTheme.typography.bodySmall)
                                        FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                                            (listOf(0,5,10,15)+repeat).distinct().filter { it<interval }.forEach { n ->
                                                FilterChip(selected=repeat==n,onClick={repeat=n},label={Text(if(n==0)"خاموش" else "${fa(n)} دقیقه بعد")})
                                            }
                                        }
                                        val paused=pause>Instant.now().toEpochMilli()
                                        OutlinedButton(onClick={pause=if(paused)0 else Instant.now().plusSeconds(3600).toEpochMilli()},modifier=Modifier.fillMaxWidth()) {
                                            Text(if(paused)"ادامه یادآوری آب" else "توقف برای یک ساعت")
                                        }
                                    }
                                }
                            }
                        }
                        1 -> Panel {
                            Text("از صبح، پیش از رسیدن نوبت",style=MaterialTheme.typography.titleMedium)
                            Text("در روز قرار، نام پزشک و زمان و مکان نوبت را یادآوری می‌کنیم.",style=MaterialTheme.typography.bodyMedium)
                            TimeSetting("شروع یادآوری روز قرار",appointmentStart,{appointmentStart=it})
                            Text("تا قبل از نوبت، یادآوری کن",style=MaterialTheme.typography.bodyMedium)
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                listOf(60 to "هر ۱ ساعت",120 to "هر ۲ ساعت").forEach { (n,label) ->
                                    FilterChip(selected=appointmentInterval==n,onClick={appointmentInterval=n},label={Text(label)},modifier=Modifier.weight(1f))
                                }
                            }
                            Text("برای نوبت‌های قبل از ساعت شروع، یک ساعت زودتر خبر می‌دهیم. پس از رسیدن زمان نوبت، یادآوری متوقف می‌شود.",
                                style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        2 -> {
                            Panel {
                                SwitchRow("دریافت اعلان‌ها",data.settings.consent && vm.enabled) {
                                    if(it)requestPermission() else vm.change({d->d.settings=d.settings.copy(consent=false)})
                                }
                                SwitchRow("نمایش جزئیات در اعلان",showDetails) { showDetails=it }
                                Text(if(showDetails)"نام دارو، دستور مصرف و اطلاعات قرار نمایش داده می‌شود." else "فقط پیام یادآوری نمایش داده می‌شود.",
                                    style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                HorizontalDivider()
                                Text("نمونه اعلان",style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.primary)
                                Text(if(showDetails)"وقت مصرف ویتامین D" else "یادآوری Medora",style=MaterialTheme.typography.titleSmall)
                                Text(if(showDetails)"ساعت مصرف: ۰۸:۰۰\nیک عدد، طبق دستور ثبت‌شده" else "برای جزئیات برنامه را باز کنید",style=MaterialTheme.typography.bodySmall)
                            }
                            Panel {
                                Text("مجوزهای گوشی",style=MaterialTheme.typography.titleMedium)
                                if(vm.exact)Text("یادآوری دقیق فعال است",color=MaterialTheme.colorScheme.primary)
                                else OutlinedButton(onClick=openExact,modifier=Modifier.fillMaxWidth()) { Text("فعال‌کردن یادآوری دقیق") }
                                TextButton(onClick=openNotifications) { Text("تنظیمات اعلان در گوشی") }
                            }
                        }
                    }
                    (error?:vm.error)?.let { Text(it,color=MaterialTheme.colorScheme.error) }
                }
                Button(onClick=::save,enabled=!vm.busy,modifier=Modifier.fillMaxWidth()) { Text(if(vm.busy)"در حال ذخیره…" else "ذخیره تنظیمات") }
            }
        }
    }
}

@Composable fun TimeSetting(label:String,value:String,change:(String)->Unit,modifier:Modifier=Modifier) {
    val context=LocalContext.current
    OutlinedButton(onClick={
        val time=LocalTime.parse(value)
        TimePickerDialog(context,{_,h,m->change(LocalTime.of(h,m).toString())},time.hour,time.minute,true).show()
    },modifier=modifier.fillMaxWidth()) {
        Column(horizontalAlignment=Alignment.CenterHorizontally) {
            Text(label,style=MaterialTheme.typography.labelSmall)
            Text(fa(value),style=MaterialTheme.typography.titleMedium)
        }
    }
}
