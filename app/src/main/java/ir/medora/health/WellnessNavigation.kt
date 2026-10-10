package ir.medora.health

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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class DockDestination(val id: String, val label: String, val icon: ImageVector, val tag: String)

@Composable
fun WellnessNavigationDock(selected: String, onSelect: (String) -> Unit) {
    val destinations = listOf(
        DockDestination("settings", "app.settings", Icons.Default.Settings, "settings"),
        DockDestination("insights", "nav.insights", Icons.Default.BarChart, "nav-insights"),
        DockDestination("today", "nav.today", Icons.Default.Home, "nav-0"),
        DockDestination("medications", "nav.medications", Icons.Default.Medication, "nav-2"),
        DockDestination("appointments", "nav.appointments", Icons.Default.Event, "nav-3")
    )
    Box(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(30.dp), color = MaterialTheme.colorScheme.surface,
            shadowElevation = 5.dp, modifier = Modifier.widthIn(max = 760.dp).fillMaxWidth().testTag("navigation-dock")) {
            // The home destination stays in the physical center in both language directions.
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    destinations.forEach { destination ->
                        val active = selected == destination.id
                        val label = tr(destination.label)
                        Column(Modifier.weight(1f).heightIn(min = 78.dp)
                            .selectable(selected = active, role = Role.Tab, onClick = { onSelect(destination.id) })
                            .testTag(destination.tag).padding(horizontal = 2.dp, vertical = 2.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (destination.id == "today") {
                                Surface(shape = CircleShape, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                    contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer,
                                    shadowElevation = if (active) 3.dp else 0.dp, modifier = Modifier.size(50.dp)) {
                                    Box(contentAlignment = Alignment.Center) { Icon(destination.icon, label, Modifier.size(26.dp)) }
                                }
                            } else {
                                Box(Modifier.height(50.dp), contentAlignment = Alignment.Center) {
                                    Icon(destination.icon, label, Modifier.size(23.dp),
                                        tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Text(label, fontSize = 10.sp, lineHeight = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
