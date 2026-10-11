package ir.medora.health

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import java.time.LocalTime

/** One generated vector supplies welcome, headers, navigation, launcher and the notification mask. */
@Composable
fun MedoraMark(modifier: Modifier = Modifier, tint: Color = MaterialTheme.colorScheme.primary) {
    Icon(painterResource(R.drawable.ic_brand), contentDescription = null, modifier = modifier, tint = tint)
}

private fun DrawScope.leaf(x: Float, y: Float, width: Float, height: Float, angle: Float, color: Color) {
    rotate(angle, Offset(x, y)) {
        val path = Path().apply {
            moveTo(x, y)
            cubicTo(x - width, y - height * .4f, x - width * .6f, y - height * .85f, x, y - height)
            cubicTo(x + width * .6f, y - height * .85f, x + width, y - height * .4f, x, y)
            close()
        }
        drawPath(path, color)
    }
}

/** Local vector illustration, no remote images, bitmap decoding or continuous decorative animation. */
@Composable
fun BotanicalArtwork(modifier: Modifier = Modifier, landscape: Boolean = false) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Canvas(modifier) {
        val w = size.width; val h = size.height
        if (landscape) {
            drawCircle(MedoraColors.Gold.copy(alpha = .85f), h * .22f, Offset(w * .72f, h * .48f))
            listOf(.52f to Color(0xFF2B9984), .67f to Color(0xFF187569), .82f to Color(0xFF0F5048)).forEach { (level, color) ->
                val path = Path().apply {
                    moveTo(0f, h * level)
                    cubicTo(w * .25f, h * (level - .24f), w * .38f, h * (level + .2f), w * .62f, h * level)
                    cubicTo(w * .79f, h * (level - .28f), w * .93f, h * (level - .03f), w, h * (level - .14f))
                    lineTo(w, h); lineTo(0f, h); close()
                }; drawPath(path, color)
            }
        }
        val x = if (rtl) w * .88f else w * .12f
        val sign = if (rtl) -1 else 1
        leaf(x, h * .98f, w * .10f, h * .72f, sign * 17f, Color(0xFF66D8C2).copy(alpha = .25f))
        leaf(x, h * .80f, w * .08f, h * .48f, sign * -42f, Color(0xFF8AE0AC).copy(alpha = .28f))
        leaf(x, h * .65f, w * .065f, h * .45f, sign * 42f, MedoraColors.Gold.copy(alpha = .2f))
        leaf(x, h * .40f, w * .06f, h * .35f, sign * -18f, Color(0xFF66D8C2).copy(alpha = .24f))
    }
}

@Composable
fun MedoraHeader(title: String, subtitle: String = "", onBack: (() -> Unit)? = null, onClose: (() -> Unit)? = null) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 12.dp))
        .background(Brush.linearGradient(listOf(MedoraColors.Forest, MedoraColors.Primary)))) {
        BotanicalArtwork(Modifier.matchParentSize())
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (onBack != null) IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("common.close"), tint = Color.White)
            } else MedoraMark(Modifier.size(30.dp), Color(0xFFB8EAD5))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = Color.White, style = MaterialTheme.typography.headlineSmall)
                if (subtitle.isNotBlank()) Text(subtitle, color = Color(0xFFDDF1E8), style = MaterialTheme.typography.bodySmall)
            }
            if (onClose != null) IconButton(onClick = onClose) {
                Icon(Icons.Default.Close, tr("common.close"), tint = Color.White)
            }
        }
    }
}

@Composable
fun MedoraEmptyArtwork(kind: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(132.dp), contentAlignment = Alignment.Center) {
        BotanicalArtwork(Modifier.width(200.dp).fillMaxHeight())
        if (kind == "medication") MedicationBadge(MedicationIcon.CAPSULE, MedicationColor.ORANGE, Modifier.size(76.dp))
        else Icon(if (kind == "water") Icons.Default.WaterDrop else Icons.Default.Event,
            null, Modifier.size(64.dp), tint = wellnessAccent(if (kind == "water") MedoraColors.Water else MedoraColors.Appointment))
    }
}

@Composable
fun SettingsCategoryTile(title: String, detail: String, index: Int, click: () -> Unit) {
    val colors = listOf(MedoraColors.WaterContainer, MedoraColors.Warm, MedoraColors.Lavender, MedoraColors.PrimaryContainer, MedoraColors.PrimaryContainer)
    val icons = listOf(Icons.Default.WaterDrop, Icons.Default.Medication, Icons.Default.Event, Icons.Default.Notifications, Icons.Default.Palette)
    Surface(color = wellnessTint(colors[index]), shape = MedoraFeatureShape,
        modifier = Modifier.fillMaxWidth().clip(MedoraFeatureShape).clickable(role = Role.Button, onClick = click)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icons[index], null, Modifier.size(28.dp), tint = MaterialTheme.colorScheme.onSurface)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall)
            }
            Icon(Icons.Default.ExpandMore, null, tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** State is committed only by confirmation; dismissal preserves the caller's previous time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedoraTimePicker(initial: LocalTime, onDismiss: () -> Unit, onPicked: (Int, Int) -> Unit) {
    val state = rememberTimePickerState(initial.hour, initial.minute, is24Hour = true)
    var keyboard by rememberSaveable { mutableStateOf(false) }
    val largeText = LocalDensity.current.fontScale > 1.3f
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface, modifier = Modifier.testTag("medora-time-picker")) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tr("medication.time"), style = MaterialTheme.typography.titleLarge)
            // The clock avoids fixed-width large numeric fields when accessibility text is enlarged.
            if (keyboard && !largeText) TimeInput(state) else TimePicker(state)
            if (!largeText) TextButton(onClick = { keyboard = !keyboard }) {
                Icon(if (keyboard) Icons.Default.Schedule else Icons.Default.Keyboard, null)
                Spacer(Modifier.width(8.dp)); Text(tr(if (keyboard) "design.clockMode" else "design.keyboardMode"))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(tr("common.cancel")) }
                Button(onClick = { onPicked(state.hour, state.minute) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("time-confirm")) { Text(tr("common.select")) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicationDetailsSheet(medication: Medication, data: HealthData, vm: HealthViewModel, close: () -> Unit, edit: () -> Unit) {
    val language=LocalLanguage.current
    ModalBottomSheet(onDismissRequest = close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Panel(color = medicationSurface(medication.color)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MedicationBadge(medication.icon, medication.color)
                    Text(medication.name, Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
                    IconButton(onClick = close) { Icon(Icons.Default.Close, tr("common.close")) }
                }
                if (medication.instructions.isNotBlank()) Text(medication.instructions)
                Text(tr("medication.times") + ": " + medication.times.joinToString(" · ") { localizedNumber(it,language) })
                Text(tr("medication.startDate") + ": " + displayDate(java.time.LocalDate.parse(medication.startDay)))
                PrimaryAction(tr("common.edit"), edit)
            }
            Heading(tr("design.intakeHistory"))
            val doses = data.doses.filter { it.medicationId == medication.id }.sortedByDescending { it.wall }
            if (doses.isEmpty()) Empty(tr("medication.historyEmpty"))
            doses.forEach { dose ->
                Text(displayDate(java.time.LocalDate.parse(dose.wall.substring(0, 10))), style = MaterialTheme.typography.bodySmall)
                DoseCard(dose, vm, actionable = !java.time.LocalDate.parse(dose.wall.substring(0, 10)).isAfter(java.time.LocalDate.now()))
            }
        }
    }
}
