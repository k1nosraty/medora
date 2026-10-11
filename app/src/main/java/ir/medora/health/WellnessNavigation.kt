package ir.medora.health

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class DockDestination(val id: String, val label: String, val icon: ImageVector, val tag: String)

@Composable
fun WellnessNavigationDock(selected: String, onSelect: (String) -> Unit) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val destinations = listOf(
        DockDestination("settings", "app.settings", Icons.Default.Settings, "settings"),
        DockDestination("insights", "nav.insights", Icons.Default.BarChart, "nav-insights"),
        DockDestination("today", "nav.today", Icons.Default.Home, "nav-0"),
        DockDestination("appointments", "nav.appointments", Icons.Default.Event, "nav-3"),
        DockDestination("medications", "nav.medications", Icons.Default.Medication, "nav-2")
    ).let { if(rtl) it else it.reversed() }
    Box(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).padding(horizontal = 10.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f)),
            shadowElevation = 2.dp, modifier = Modifier.widthIn(max = 760.dp).fillMaxWidth().testTag("navigation-dock")) {
            // The home destination stays in the physical center in both language directions.
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    destinations.forEach { destination ->
                        val active = selected == destination.id
                        val label = tr(when (destination.id) {
                            "settings" -> "nav.settings.short"
                            "medications" -> "nav.medications.short"
                            "appointments" -> "nav.appointments.short"
                            "insights" -> "nav.insights.short"
                            else -> destination.label
                        })
                        val description = tr(destination.label)
                        val selectionColor = animateColorAsState(
                            if (active && destination.id != "today") MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                            label = "dock-selection").value
                        Column(Modifier.weight(1f).heightIn(min = 76.dp)
                            // Clip before selectable so its ripple follows the rounded touch target.
                            .clip(RoundedCornerShape(20.dp)).background(selectionColor)
                            .selectable(selected = active, role = Role.Tab, onClick = { onSelect(destination.id) })
                            .semantics { contentDescription = description }
                            .testTag(destination.tag).padding(horizontal = 2.dp, vertical = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            if (destination.id == "today") {
                                Surface(shape = CircleShape, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                    contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer,
                                    shadowElevation = if (active) 2.dp else 0.dp, modifier = Modifier.size(50.dp)) {
                                    Box(contentAlignment = Alignment.Center) { MedoraMark(Modifier.size(30.dp),LocalContentColor.current) }
                                }
                            } else {
                                Box(Modifier.height(50.dp), contentAlignment = Alignment.Center) {
                                    Icon(destination.icon, null, Modifier.size(23.dp),
                                        tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Text(label, fontSize = 14.sp, lineHeight = 18.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                color = when {
                                    active && destination.id != "today" -> MaterialTheme.colorScheme.onPrimaryContainer
                                    active -> MaterialTheme.colorScheme.primary
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                })
                        }
                    }
                }
            }
        }
    }
}
