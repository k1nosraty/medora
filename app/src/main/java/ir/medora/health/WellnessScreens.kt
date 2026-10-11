package ir.medora.health

import androidx.compose.ui.platform.testTag

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.LocalDateTime

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(MedoraColors.Forest,MedoraColors.Primary)))) {
        BotanicalArtwork(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(320.dp),landscape=true)
        Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.height(24.dp))
            WellnessBrand(Modifier.size(148.dp))
            Text(if(LocalLanguage.current=="fa") "مدورا" else "Medora",style=MaterialTheme.typography.displayMedium,color=Color.White)
            Text(tr("welcome.tagline"),style=MaterialTheme.typography.titleLarge,color=Color.White,textAlign=TextAlign.Center)
            Text(tr("welcome.intro"),style=MaterialTheme.typography.bodyMedium,color=Color(0xFFDDF1E8),textAlign=TextAlign.Center)
            Spacer(Modifier.height(60.dp))
            Button(onClick=onStart,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp),shape=RoundedCornerShape(50),
                colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFB8EAD5),contentColor=MedoraColors.Forest)) {
                Text(tr("welcome.start"))
            }
            Text(tr("welcome.local"),style=MaterialTheme.typography.bodySmall,color=Color(0xFFDDF1E8),textAlign=TextAlign.Center)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun DaySelector(day: LocalDate, choose: () -> Unit, change: (LocalDate) -> Unit, showArrows: Boolean = true, allowFuture: Boolean = false) {
    Panel(compact=true) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            if(showArrows) IconButton(onClick={change(day.minusDays(1))}) { Icon(Icons.AutoMirrored.Filled.ArrowBack,tr("a11y.openDate")) }
            TextButton(onClick=choose,modifier=Modifier.weight(1f).heightIn(min=48.dp)) {
                Text(if(day==LocalDate.now()) tr("date.today") else displayDate(day),textAlign=TextAlign.Center)
                Spacer(Modifier.width(6.dp));Icon(Icons.Default.ExpandMore,null,Modifier.size(18.dp))
            }
            if(showArrows) IconButton(onClick={change(day.plusDays(1))},modifier=Modifier.testTag("day-next"),enabled=allowFuture || day.isBefore(LocalDate.now())) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward,tr("a11y.openDate"))
            }
        }
        if(showArrows) {
            val language=LocalLanguage.current
            val scroll=rememberScrollState()
            LaunchedEffect(day,scroll.maxValue) { scroll.scrollTo(scroll.maxValue/2) }
            Row(Modifier.fillMaxWidth().horizontalScroll(scroll),horizontalArrangement=Arrangement.spacedBy(4.dp)) {
                (-3L..3L).forEach { offset ->
                    val date=day.plusDays(offset)
                    val selected=offset==0L
                    val label=displayDate(date,true)
                    Column(Modifier.width(48.dp).heightIn(min=48.dp).clip(RoundedCornerShape(20.dp))
                        .background(if(selected) MaterialTheme.colorScheme.primary else Color.Transparent)
                        .semantics { contentDescription=label;this.selected=selected }
                        .clickable(enabled=allowFuture || !date.isAfter(LocalDate.now()),role=Role.Button) { change(date) }.padding(2.dp),
                        horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(0.dp)) {
                        val key=CalendarSupport.shortWeekdays(language)[CalendarSupport.weekdayOrder(language).indexOf(date.dayOfWeek.value)]
                        val ink=if(selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                        Text(tr(key),style=MaterialTheme.typography.labelSmall,color=ink)
                        Text(n(CalendarSupport.dayOfMonth(date,LocalCalendar.current)),style=MaterialTheme.typography.titleSmall,color=ink)
                    }
                }
            }
        }
    }
}

@Composable
fun ChoiceStrip(labels: List<String>, selected: Int, change: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        labels.forEachIndexed { index, label ->
            Box(Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(16.dp))
                .background(if (index == selected) wellnessTint(MedoraColors.WaterContainer) else Color.Transparent)
                .semantics { this.selected = index == selected }
                .clickable(role = Role.Tab) { change(index) }.padding(horizontal = 4.dp, vertical = 12.dp),
                contentAlignment = Alignment.Center) {
                Text(label, style = MaterialTheme.typography.labelLarge,
                    color = if (index == selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (index == selected) FontWeight.Bold else FontWeight.Normal, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
fun ActivityCalendarScreen(data: HealthData, vm: HealthViewModel, openEditor: (Editor) -> Unit) {
    val calendar = LocalCalendar.current
    val language = LocalLanguage.current
    var selection by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var month by rememberSaveable(calendar) { mutableStateOf(CalendarSupport.startOfMonth(LocalDate.now(), calendar).toString()) }
    val selectedDay = LocalDate.parse(selection)
    val monthStart = LocalDate.parse(month)
    val leading = Math.floorMod(monthStart.dayOfWeek.value - CalendarSupport.firstDayOfWeek(language), 7)
    val length = CalendarSupport.monthLength(monthStart, calendar)
    val waterDays = data.water.map { it.day }.toSet()
    val appointmentDays = data.appointments.filter { !it.cancelled }.map { LocalDateTime.parse(it.wall).toLocalDate().toString() }.toSet()
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { month = CalendarSupport.plusMonths(monthStart, -1, calendar).toString() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("a11y.previousMonth"))
            }
            Text(CalendarSupport.monthTitle(monthStart, calendar, language), Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            IconButton(onClick = { month = CalendarSupport.plusMonths(monthStart, 1, calendar).toString() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, tr("a11y.nextMonth"))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            CalendarSupport.shortWeekdays(language).forEach { key ->
                Text(tr(key), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center)
            }
        }
        repeat((leading + length + 6) / 7) { row ->
            Row(Modifier.fillMaxWidth()) {
                repeat(7) { column ->
                    val offset = row * 7 + column - leading
                    val date = if (offset in 0 until length) monthStart.plusDays(offset.toLong()) else null
                    if (date == null) Spacer(Modifier.weight(1f).height(52.dp)) else {
                        val isSelected = selectedDay == date
                        val hasDoses = data.calendarDoses(date).isNotEmpty()
                        val events = listOfNotNull(
                            MedoraColors.Water.takeIf { date.toString() in waterDays },
                            MedoraColors.Medication.takeIf { hasDoses },
                            MedoraColors.Appointment.takeIf { date.toString() in appointmentDays })
                        val dateLabel = CalendarSupport.formatDate(date, calendar, language)
                        val eventLabel = listOfNotNull(
                            localizedText("nav.water", language).takeIf { date.toString() in waterDays },
                            localizedText("nav.medications", language).takeIf { hasDoses },
                            localizedText("nav.appointments", language).takeIf { date.toString() in appointmentDays }).joinToString(", ")
                        Column(Modifier.weight(1f).heightIn(min = 52.dp).padding(1.dp).clip(RoundedCornerShape(16.dp))
                            .background(if (isSelected) wellnessTint(MedoraColors.WaterContainer) else Color.Transparent)
                            .semantics { selected = isSelected; contentDescription = "$dateLabel $eventLabel" }
                            .clickable(role = Role.Button) { selection = date.toString() }.padding(vertical = 7.dp),
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(n(CalendarSupport.dayOfMonth(date, calendar)), style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isSelected || date == LocalDate.now()) FontWeight.Bold else FontWeight.Normal)
                            Row(Modifier.height(8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                                events.forEach { color -> Box(Modifier.size(4.dp).clip(CircleShape).background(wellnessAccent(color))) }
                            }
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("nav.water" to MedoraColors.Water, "nav.medications" to MedoraColors.Medication, "nav.appointments" to MedoraColors.Appointment).forEach { (key, color) ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(wellnessAccent(color)))
                    Text(tr(key), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    Heading(displayDate(selectedDay, true))
    val doses = data.calendarDoses(selectedDay)
    val appointments = data.appointments.filter { LocalDateTime.parse(it.wall).toLocalDate() == selectedDay }.sortedBy { it.wall }
    val total = data.total(selection)
    if (total > 0) Panel(color = wellnessTint(MedoraColors.WaterContainer), compact = true) {
        Text(tr("calendar.water"), fontWeight = FontWeight.SemiBold)
        Text(tr("water.ml", n(total)), style = MaterialTheme.typography.titleLarge)
    }
    doses.forEach { DoseCard(it, vm, actionable = !selectedDay.isAfter(LocalDate.now())) }
    appointments.forEach { appointment ->
        AppointmentCard(appointment, edit = { openEditor(Editor("appointment", appointment = appointment)) },
            toggle = { vm.change({ it.appointments.replace(appointment.copy(cancelled = !appointment.cancelled)) }) },
            delete = {}, showDelete = false)
    }
    if (total == 0 && doses.isEmpty() && appointments.isEmpty()) Empty(tr("calendar.empty"))
    PrimaryAction(tr("appointment.new"), { openEditor(Editor("appointment", date = selectedDay.toString())) })
}

@Composable
fun ReportsScreen(data: HealthData) {
    var period by rememberSaveable { mutableIntStateOf(1) }
    val today = LocalDate.now()
    val calendar = LocalCalendar.current
    val start = when (period) {
        0 -> today.minusDays(6)
        1 -> CalendarSupport.startOfMonth(today, calendar)
        else -> if (calendar == "jalali") CalendarSupport.solarDate(today).let { CalendarSupport.toGregorian(it.year, 1, 1) }
            else today.withDayOfYear(1)
    }
    val report = data.careReport(start, today)
    ChoiceStrip(listOf(tr("reports.week"), tr("reports.month"), tr("reports.year")), period) { period = it }
    Text(tr("reports.range", displayDate(start), displayDate(today)), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Panel(color=wellnessTint(MedoraColors.WaterContainer),feature=true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            WellnessIcon(Icons.Default.WaterDrop, MedoraColors.Water)
            Column(Modifier.weight(1f)) {
                Text(tr("reports.water"), fontWeight = FontWeight.Bold)
                Text(tr("reports.average"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(tr("water.ml", n(report.averageWater)), color = wellnessAccent(MedoraColors.Water), fontWeight = FontWeight.Bold)
        }
        WaterTrendChart(report.waterByDay, data.settings.goal)
        Text(tr("reports.goalNote"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(tr("reports.total") + ": " + tr("water.ml", n(report.totalWater)), style = MaterialTheme.typography.bodyMedium)
        if (report.totalWater == 0L) Text(tr("reports.empty"), style = MaterialTheme.typography.bodySmall)
    }
    Panel(color=wellnessTint(MedoraColors.Warm),feature=true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MedicationBadge(MedicationIcon.CAPSULE,MedicationColor.ORANGE)
            Column(Modifier.weight(1f)) {
                Text(tr("reports.doses"), fontWeight = FontWeight.Bold)
                Text(tr("reports.summary", n(report.taken), n(report.totalDoses)), style = MaterialTheme.typography.bodySmall)
            }
            if (report.totalDoses > 0) ProgressRing(report.taken.toFloat() / report.totalDoses, MedoraColors.Primary)
        }
        listOf("dose.taken" to report.taken, "dose.skipped" to report.skipped, "dose.pending" to report.unmarked).forEach { (key, count) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(tr(key), style = MaterialTheme.typography.bodyMedium)
                Text(n(count), fontWeight = FontWeight.Bold)
            }
        }
        Text(tr("reports.note"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun WaterTrendChart(days: List<Pair<LocalDate, Int>>, goal: Int) {
    val language = LocalLanguage.current
    val calendar = LocalCalendar.current
    val color = wellnessAccent(MedoraColors.Water)
    val grid = MaterialTheme.colorScheme.outlineVariant
    val description = days.joinToString("; ") { (day, amount) ->
        CalendarSupport.formatDate(day, calendar, language) + ": " + localizedText("water.ml", language, localizedNumber(amount, language))
    }
    val maximum = maxOf(goal, days.maxOfOrNull { it.second } ?: 0, 1)
    // Long ranges remain legible: each bar is a mean over consecutive days.
    val chunk = ((days.size + 30) / 31).coerceAtLeast(1)
    val bars = days.chunked(chunk).map { group -> group.map { it.second }.average().toFloat() }
    Column {
        Text(tr("water.ml", n(maximum)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Canvas(Modifier.fillMaxWidth().height(168.dp).semantics { contentDescription = description }) {
            val baseline = size.height - 6.dp.toPx()
            val usable = baseline - 8.dp.toPx()
            repeat(3) { index ->
                val y = baseline - usable * index / 2
                drawLine(grid, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
            }
            val goalY = baseline - usable * goal / maximum
            drawLine(color.copy(alpha = .5f), Offset(0f, goalY), Offset(size.width, goalY), 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())))
            val pitch = size.width / bars.size.coerceAtLeast(1)
            bars.forEachIndexed { index, amount ->
                val height = usable * amount / maximum
                if (height > 0f) drawRoundRect(Brush.verticalGradient(listOf(color.copy(alpha = .7f), color)),
                    Offset(index * pitch + pitch * .18f, baseline - height), Size(pitch * .64f, height),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(3.dp.toPx()))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            days.firstOrNull()?.let { Text(displayDate(it.first), style = MaterialTheme.typography.labelSmall) }
            days.lastOrNull()?.let { Text(displayDate(it.first), style = MaterialTheme.typography.labelSmall) }
        }
    }
}



@Composable
fun ReminderPermissionScreen(enable: ()->Unit,skip: ()->Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).safeDrawingPadding()
        .verticalScroll(rememberScrollState()).padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally,
        verticalArrangement=Arrangement.spacedBy(20.dp)) {
        Box(Modifier.fillMaxWidth().height(230.dp),contentAlignment=Alignment.Center) {
            BotanicalArtwork(Modifier.matchParentSize(),landscape=true)
            Icon(Icons.Default.Notifications,null,Modifier.size(88.dp),tint=MedoraColors.Gold)
        }
        Text(tr("permission.title"),style=MaterialTheme.typography.headlineSmall,textAlign=TextAlign.Center)
        Text(tr("permission.body"),style=MaterialTheme.typography.bodyLarge,textAlign=TextAlign.Center)
        PrimaryAction(tr("permission.enable"),enable)
        OutlinedButton(onClick=skip,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) {Text(tr("design.later"))}
    }
}
