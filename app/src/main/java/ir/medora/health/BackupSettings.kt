package ir.medora.health

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy

@Composable
internal fun BackupSettings(vm: HealthViewModel) {
    var restoring by remember { mutableStateOf<Boolean?>(null) }
    var pendingPassword by remember { mutableStateOf<CharArray?>(null) }
    var result by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    DisposableEffect(Unit) {
        onDispose { pendingPassword?.fill('\u0000') }
    }

    fun finishPick(uri: Uri?, restore: Boolean) {
        val password = pendingPassword ?: return
        pendingPassword = null
        if (uri == null) {
            password.fill('\u0000')
            return
        }
        vm.transferBackup(uri, password, restore) { success ->
            val key = when {
                restore && success -> "backup.restored"
                restore -> "backup.restoreError"
                success -> "backup.exported"
                else -> "backup.exportError"
            }
            result = key to success
        }
    }

    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) {
        finishPick(it, restore = false)
    }
    val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
        finishPick(it, restore = true)
    }
    Panel {
        Text(tr("backup.help"))
        val canStart = !vm.busy && pendingPassword == null
        Button(onClick = { restoring = false }, enabled = canStart, modifier = Modifier.fillMaxWidth()) {
            Text(tr("backup.export"))
        }
        OutlinedButton(onClick = { restoring = true }, enabled = canStart, modifier = Modifier.fillMaxWidth()) {
            Text(tr("backup.restore"))
        }
        if (vm.busy) CircularProgressIndicator()
        result?.let { (key, success) ->
            Text(tr(key), color = if (success) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error)
        }
    }
    restoring?.let { restore ->
        BackupPasswordDialog(restore, close = { restoring = null }) { password ->
            restoring = null
            result = null
            pendingPassword = password
            if (restore) importFile.launch(arrayOf("*/*")) else export.launch("Medora.medora")
        }
    }
}

@Composable
private fun BackupPasswordDialog(restore: Boolean, close: () -> Unit, proceed: (CharArray) -> Unit) {
    // Password fields must never go into saved instance state.
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    val minLength = if (restore) 1 else PortableBackup.MIN_PASSWORD_LENGTH
    AlertDialog(
        onDismissRequest = close,
        properties = DialogProperties(securePolicy = SecureFlagPolicy.SecureOn),
        title = { Text(tr(if (restore) "backup.restore" else "backup.export")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tr(if (restore) "backup.replaceWarning" else "backup.passwordHelp", PortableBackup.MIN_PASSWORD_LENGTH))
                OutlinedTextField(
                    value = password,
                    onValueChange = { if (it.length <= PortableBackup.MAX_PASSWORD_LENGTH) password = it },
                    label = { Text(tr("backup.password")) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (!restore) OutlinedTextField(
                    value = confirmation,
                    onValueChange = { if (it.length <= PortableBackup.MAX_PASSWORD_LENGTH) confirmation = it },
                    label = { Text(tr("backup.confirmPassword")) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    isError = confirmation.isNotEmpty() && confirmation != password,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val submitted = password.toCharArray()
                    password = ""
                    confirmation = ""
                    proceed(submitted)
                },
                enabled = password.length >= minLength && (restore || password == confirmation)
            ) { Text(tr(if (restore) "backup.chooseFile" else "backup.chooseLocation")) }
        },
        dismissButton = { TextButton(onClick = close) { Text(tr("common.cancel")) } }
    )
}
