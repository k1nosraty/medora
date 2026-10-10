package ir.medora.health

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate

/** Reference colors are softened into dark surfaces without losing semantic accents. */
@Composable
fun wellnessTint(light: Color): Color = if (MaterialTheme.colorScheme.background == MedoraColors.Background) light
    else lerp(MaterialTheme.colorScheme.surface, light, .12f)

@Composable
fun wellnessAccent(light: Color): Color = if (MaterialTheme.colorScheme.background == MedoraColors.Background) light
    else lerp(light, Color.White, .4f)

@Composable
fun WellnessIcon(icon: ImageVector, accent: Color, modifier: Modifier = Modifier) {
    val tint = wellnessAccent(accent)
    Box(modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(wellnessTint(accent.copy(alpha = .12f))),
        contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(24.dp))
    }
}

@Composable
fun PrimaryAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, shape = RoundedCornerShape(16.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp)) { Text(label) }
}

@Composable
fun ProgressRing(progress: Float, accent: Color, modifier: Modifier = Modifier) {
    val value by animateFloatAsState(progress.coerceIn(0f, 1f), label = "progress")
    val description = tr("water.percent", n((progress * 100).toInt()))
    val tint = wellnessAccent(accent)
    val track = wellnessTint(accent.copy(alpha = .15f))
    Box(modifier.size(86.dp).semantics {
        contentDescription = description
        progressBarRangeInfo = ProgressBarRangeInfo(progress.coerceIn(0f, 1f), 0f..1f)
    }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize().padding(5.dp)) {
            val stroke = 8.dp.toPx()
            val inset = stroke / 2
            drawArc(track, -90f, 360f, false, Offset(inset, inset),
                Size(size.width - stroke, size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Round))
            if (value > 0f) drawArc(tint, -90f, 360f * value, false, Offset(inset, inset),
                Size(size.width - stroke, size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Text(description, fontWeight = FontWeight.Bold, color = tint, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun WaterProgressCard(data: HealthData, day: LocalDate, onAdd: () -> Unit) {
    val key = day.toString()
    Panel(color = wellnessTint(MedoraColors.WaterContainer)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    WellnessIcon(Icons.Default.WaterDrop, MedoraColors.Water)
                    Text(tr("today.waterCompact"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                Text(tr("water.progress", n(data.total(key)), n(data.settings.goal)),
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(if (data.remaining(key) == 0) tr("water.goalReached") else tr("water.remaining", n(data.remaining(key))),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            ProgressRing(data.progress(key), MedoraColors.Water)
        }
        PrimaryAction(tr("today.waterAction"), onAdd)
    }
}

/** Offline vector drawing: tapered glass, clipped water waves and reflected light. */
@Composable
fun WaterGlass(progress: Float, modifier: Modifier = Modifier) {
    val level by animateFloatAsState(progress.coerceIn(0f, 1f), label = "water-level")
    Canvas(modifier.width(124.dp).height(160.dp)) {
        val w = size.width
        val h = size.height
        val glass = Path().apply {
            moveTo(w * .13f, h * .07f)
            quadraticTo(w * .5f, 0f, w * .87f, h * .07f)
            lineTo(w * .77f, h * .88f)
            quadraticTo(w * .5f, h * .97f, w * .23f, h * .88f)
            close()
        }
        drawOval(Color(0xFF5B9ABE).copy(alpha = .1f), Offset(w * .16f, h * .9f), Size(w * .68f, h * .08f))
        drawPath(glass, Brush.horizontalGradient(listOf(Color(0xFFE4F4FF).copy(alpha = .4f), Color(0xFFF3FAFF).copy(alpha = .7f))))
        clipPath(glass) {
            val y = h * (.9f - .78f * level)
            val water = Path().apply {
                moveTo(0f, y)
                cubicTo(w * .3f, y - h * .07f, w * .65f, y + h * .08f, w, y)
                lineTo(w, h); lineTo(0f, h); close()
            }
            if (level > 0f) {
                drawPath(water, Brush.verticalGradient(listOf(Color(0xFF84D3FC), Color(0xFF36A7E8)), y, h))
                drawOval(Color.White.copy(alpha = .24f), Offset(0f, y - h * .025f), Size(w, h * .055f))
            }
            drawLine(Color.White.copy(alpha = .72f), Offset(w * .22f, h * .18f), Offset(w * .3f, h * .79f), w * .055f, StrokeCap.Round)
        }
        drawPath(glass, Color(0xFFB7DAF0), style = Stroke(2.dp.toPx()))
        drawOval(Color.White.copy(alpha = .4f), Offset(w * .13f, h * .015f), Size(w * .74f, h * .095f), style = Stroke(2.dp.toPx()))
    }
}

/** Small capsule artwork, drawn once and reused instead of a remote asset. */
@Composable
fun CapsuleIcon(modifier: Modifier = Modifier) {
    Box(modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(wellnessTint(MedoraColors.WarningContainer)),
        contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(29.dp)) {
            rotate(-38f) {
                val x = size.width * .2f
                val y = size.height * .07f
                val capsule = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(
                    x, y, size.width * .8f, size.height * .93f, CornerRadius(size.width * .3f))) }
                clipPath(capsule) {
                    drawRect(Brush.horizontalGradient(listOf(Color(0xFFFFB0A0), Color(0xFFFA635D))))
                    drawRect(Brush.horizontalGradient(listOf(Color(0xFFFFDEBD), Color(0xFFF18A42))),
                        topLeft = Offset(0f, size.height / 2), size = Size(size.width, size.height / 2))
                    drawLine(Color.White.copy(alpha = .65f), Offset(x + 4.dp.toPx(), y + 5.dp.toPx()),
                        Offset(x + 4.dp.toPx(), size.height * .4f), 2.dp.toPx(), StrokeCap.Round)
                }
            }
        }
    }
}

/** Welcome illustration follows the reference's blue droplet and two teal leaves. */
@Composable
fun WellnessBrand(modifier: Modifier = Modifier) {
    Canvas(modifier.size(210.dp)) {
        val w = size.width
        val h = size.height
        drawOval(Color(0xFF319F91).copy(alpha = .08f), Offset(w * .12f, h * .8f), Size(w * .76f, h * .1f))
        val drop = Path().apply {
            moveTo(w * .5f, h * .07f)
            cubicTo(w * .44f, h * .26f, w * .25f, h * .4f, w * .32f, h * .59f)
            cubicTo(w * .4f, h * .79f, w * .66f, h * .74f, w * .69f, h * .56f)
            cubicTo(w * .73f, h * .39f, w * .58f, h * .22f, w * .5f, h * .07f)
            close()
        }
        drawPath(drop, Brush.linearGradient(listOf(Color(0xFFA4E6FA), Color(0xFF36A7E8)), Offset(w * .3f, h * .15f), Offset(w * .7f, h * .65f)))
        drawLine(Color.White.copy(alpha = .55f), Offset(w * .43f, h * .31f), Offset(w * .37f, h * .44f), 6.dp.toPx(), StrokeCap.Round)
        val right = Path().apply {
            moveTo(w * .55f, h * .86f)
            cubicTo(w * .53f, h * .55f, w * .61f, h * .39f, w * .75f, h * .27f)
            cubicTo(w * .91f, h * .53f, w * .78f, h * .77f, w * .55f, h * .86f)
            close()
        }
        val left = Path().apply {
            moveTo(w * .45f, h * .86f)
            cubicTo(w * .2f, h * .85f, w * .13f, h * .64f, w * .12f, h * .53f)
            cubicTo(w * .35f, h * .51f, w * .48f, h * .68f, w * .45f, h * .86f)
            close()
        }
        drawPath(right, Brush.linearGradient(listOf(Color(0xFF69C3A5), Color(0xFF187E78))))
        drawPath(left, Brush.linearGradient(listOf(Color(0xFF91D6B5), Color(0xFF319F91))))
        drawLine(Color(0xFF187E78).copy(alpha = .6f), Offset(w * .55f, h * .86f), Offset(w * .73f, h * .37f), 2.dp.toPx(), StrokeCap.Round)
        drawLine(Color(0xFF187E78).copy(alpha = .5f), Offset(w * .45f, h * .86f), Offset(w * .2f, h * .6f), 2.dp.toPx(), StrokeCap.Round)
    }
}
