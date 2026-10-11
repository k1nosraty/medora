package ir.medora.health

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import java.util.Locale

enum class MedicationIcon {
    TABLET, CAPSULE, SYRUP, AMPOULE, OINTMENT, DROPS, SPRAY;
    val labelKey get() = "appearance.icon.${name.lowercase(Locale.ROOT)}"
    companion object { fun parse(value:String)=entries.find { it.name==value } ?: CAPSULE }
}
enum class MedicationColor(val argb:Int) {
    ORANGE(0xFFF18A42.toInt()), TEAL(0xFF319F91.toInt()), BLUE(0xFF1688C4.toInt()),
    LAVENDER(0xFF8E69B7.toInt()), ROSE(0xFFC87386.toInt()), SLATE(0xFF738899.toInt());
    val labelKey get() = "appearance.color.${name.lowercase(Locale.ROOT)}"
    companion object { fun parse(value:String)=entries.find { it.name==value } ?: ORANGE }
}

/** Shared normalized artwork for in-app badges and native notification bitmaps. */
private fun drawMedication(canvas:AndroidCanvas,icon:MedicationIcon,color:MedicationColor) {
    val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    val base=color.argb
    fun blend(toward:Int,f:Float):Int = AndroidColor.rgb(
        (AndroidColor.red(base)*(1-f)+AndroidColor.red(toward)*f).toInt(),
        (AndroidColor.green(base)*(1-f)+AndroidColor.green(toward)*f).toInt(),
        (AndroidColor.blue(base)*(1-f)+AndroidColor.blue(toward)*f).toInt())
    val light=blend(AndroidColor.WHITE,.55f);val shade=blend(AndroidColor.BLACK,.16f)
    fun rect(x:Float,y:Float,w:Float,h:Float,r:Float,c:Int) { paint.color=c;paint.style=Paint.Style.FILL;canvas.drawRoundRect(x,y,x+w,y+h,r,r,paint) }
    fun oval(x:Float,y:Float,w:Float,h:Float,c:Int) { paint.color=c;paint.style=Paint.Style.FILL;canvas.drawOval(x,y,x+w,y+h,paint) }
    fun line(x:Float,y:Float,xx:Float,yy:Float,c:Int,width:Float=3f) { paint.color=c;paint.strokeWidth=width;paint.strokeCap=Paint.Cap.ROUND;canvas.drawLine(x,y,xx,yy,paint) }
    when(icon) {
        MedicationIcon.TABLET -> { oval(16f,24f,68f,60f,shade);oval(16f,18f,68f,60f,base);oval(21f,21f,58f,50f,light);line(30f,62f,68f,30f,shade,4f);line(32f,65f,71f,32f,AndroidColor.WHITE,2f) }
        MedicationIcon.CAPSULE -> {
            canvas.save();canvas.rotate(-38f,50f,50f)
            val path=Path().apply { addRoundRect(29f,9f,71f,91f,21f,21f,Path.Direction.CW) }
            canvas.clipPath(path);rect(29f,9f,42f,82f,0f,light);rect(29f,50f,42f,41f,0f,base)
            line(36f,24f,36f,40f,AndroidColor.WHITE,4f);line(29f,50f,71f,50f,shade,2f);canvas.restore()
        }
        MedicationIcon.SYRUP -> { rect(25f,29f,44f,58f,10f,shade);rect(28f,29f,38f,52f,8f,base);rect(32f,15f,30f,17f,4f,base);rect(31f,49f,32f,20f,3f,light);line(76f,61f,76f,85f,shade,4f);oval(71f,48f,10f,16f,light) }
        MedicationIcon.AMPOULE -> { rect(37f,40f,26f,49f,8f,base);rect(41f,21f,18f,27f,5f,light);oval(43f,8f,14f,19f,base);line(41f,32f,59f,32f,shade,3f);rect(41f,57f,18f,23f,4f,light);line(43f,47f,43f,52f,AndroidColor.WHITE,3f) }
        MedicationIcon.OINTMENT -> {
            canvas.save();canvas.rotate(24f,50f,50f);rect(31f,17f,38f,57f,7f,light);rect(31f,14f,38f,8f,2f,base);rect(32f,38f,36f,16f,2f,base);rect(38f,73f,24f,15f,3f,shade);canvas.restore()
        }
        MedicationIcon.DROPS -> { rect(27f,43f,46f,44f,9f,light);rect(32f,33f,36f,16f,4f,base);rect(39f,13f,22f,27f,8f,shade);rect(30f,61f,40f,17f,3f,base);line(34f,49f,34f,56f,AndroidColor.WHITE,3f) }
        MedicationIcon.SPRAY -> { rect(29f,42f,42f,45f,8f,light);rect(32f,62f,36f,17f,3f,base);rect(39f,26f,22f,19f,3f,base);rect(38f,15f,34f,12f,3f,shade);line(76f,20f,83f,20f,base,3f);line(79f,12f,85f,9f,light,2f);line(79f,28f,85f,31f,light,2f) }
    }
}

fun medicationIconBitmap(icon:MedicationIcon,color:MedicationColor):Bitmap = Bitmap.createBitmap(192,192,Bitmap.Config.ARGB_8888).also {
    val canvas=AndroidCanvas(it);val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color=color.argb;alpha=28 }
    canvas.drawRoundRect(0f,0f,192f,192f,48f,48f,paint)
    canvas.translate(24f,24f);canvas.scale(1.44f,1.44f);drawMedication(canvas,icon,color)
}

@Composable
fun MedicationBadge(icon:MedicationIcon,color:MedicationColor,modifier:Modifier=Modifier) {
    val description="${tr(icon.labelKey)}، ${tr(color.labelKey)}"
    // Retain the original coral/orange capsule for existing medication records.
    if(icon==MedicationIcon.CAPSULE && color==MedicationColor.ORANGE) {
        CapsuleIcon(modifier.semantics { contentDescription=description });return
    }
    val background=Color(color.argb).copy(alpha=if(MaterialTheme.colorScheme.background==MedoraColors.Background) .12f else .22f)
    Box(modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(background)
        .semantics { contentDescription=description },contentAlignment=Alignment.Center) {
        Canvas(Modifier.size(34.dp)) { drawIntoCanvas { c ->
            val native=c.nativeCanvas;native.save();native.scale(size.width/100f,size.height/100f)
            drawMedication(native,icon,color);native.restore()
        } }
    }
}

@Composable
fun MedicationAppearancePicker(icon:MedicationIcon,color:MedicationColor,onIcon:(MedicationIcon)->Unit,onColor:(MedicationColor)->Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        TextButton(onClick={expanded=!expanded},modifier=Modifier.fillMaxWidth().testTag("appearance-toggle")) {
            MedicationBadge(icon,color)
            Spacer(Modifier.width(12.dp))
            Text(tr("appearance.title"),Modifier.weight(1f))
            Text(if(expanded) "−" else "+")
        }
        if(expanded) {
            Text(tr("appearance.icon"),style=MaterialTheme.typography.titleSmall)
            MedicationIcon.entries.chunked(4).forEach { items ->
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                    items.forEach { option ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .border(if(icon==option) 2.dp else 1.dp,if(icon==option) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,RoundedCornerShape(12.dp))
                            .selectable(icon==option,role=Role.RadioButton,onClick={onIcon(option)})
                            .testTag("appearance-icon-${option.name}").padding(vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
                            MedicationBadge(option,color)
                            Text(tr(option.labelKey),style=MaterialTheme.typography.labelSmall)
                        }
                    }
                    repeat(4-items.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            Text(tr("appearance.color"),style=MaterialTheme.typography.titleSmall)
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(2.dp)) {
                MedicationColor.entries.forEach { option ->
                    val label=tr(option.labelKey)
                    Box(Modifier.weight(1f).heightIn(min=48.dp).selectable(color==option,role=Role.RadioButton,onClick={onColor(option)})
                        .semantics { contentDescription=label }.testTag("appearance-color-${option.name}"),contentAlignment=Alignment.Center) {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(Color(option.argb)),contentAlignment=Alignment.Center) {
                            if(color==option) Text("✓",color=Color.White)
                        }
                        if(color==option) Box(Modifier.size(40.dp).border(2.dp,MaterialTheme.colorScheme.primary,CircleShape))
                    }
                }
            }
        }
    }
}
