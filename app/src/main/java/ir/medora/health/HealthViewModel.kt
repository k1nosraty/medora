package ir.medora.health

import android.app.Application
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZonedDateTime

class HealthViewModel(app:Application):AndroidViewModel(app) {
    var data by mutableStateOf<HealthData?>(null);private set
    var busy by mutableStateOf(false);private set
    var error by mutableStateOf<String?>(null);private set
    var enabled by mutableStateOf(false);private set
    var channelBlocked by mutableStateOf(false);private set
    var exact by mutableStateOf(false);private set
    var next by mutableStateOf<Reminder?>(null);private set
    private val handler=Handler(Looper.getMainLooper())
    private val queue=SerialWorkQueue(Repository.executor) { callback ->handler.post(callback) }
    private val repo=Repository.get(app)
    private val service=Reminders(app)
    private val resolver=app.contentResolver
    private val storageDispatcher=Repository.executor.asCoroutineDispatcher()
    private var transferring=false
    private data class Saved(val data:HealthData,val error:String?,val enabled:Boolean,val channelBlocked:Boolean,val exact:Boolean,val next:Reminder?)
    init { refresh() }
    fun refresh()=change({})
    fun change(mutation:(HealthData)->Unit,onSaved:()->Unit={}) {
        busy=true;error=null
        queue.submit(work={ rebuild(repo.update(mutation)) },complete={ result ->
            busy=transferring || queue.pending>0
            result.fold(onSuccess={ saved ->
                show(saved)
                onSaved()
            },onFailure={ error="error.storage" })
        })
    }

    fun transferBackup(uri: Uri, password: CharArray, restore: Boolean, onComplete: (Boolean) -> Unit) {
        transferring = true
        busy = true
        viewModelScope.launch {
            val result = try {
                Result.success(withContext(Dispatchers.IO) {
                    if (restore) {
                        val restored = requireNotNull(resolver.openInputStream(uri)).use { PortableBackup.read(it, password) }
                        withContext(storageDispatcher) {
                            restored.materialize(ZonedDateTime.now())
                            repo.save(restored)
                            rebuild(restored)
                        }
                    } else {
                        val snapshot = withContext(storageDispatcher) { repo.read() }
                        val bytes = PortableBackup.encode(snapshot, password)
                        requireNotNull(resolver.openOutputStream(uri)).use { it.write(bytes) }
                        null
                    }
                })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Result.failure(failure)
            } finally {
                password.fill('\u0000')
                transferring = false
                busy = queue.pending > 0
            }
            result.onSuccess { saved -> saved?.let(::show) }
            onComplete(result.isSuccess)
        }
    }

    private fun rebuild(committed: HealthData): Saved {
        var warning: String? = null
        val planned = try { service.rebuild(committed) } catch (_: Exception) {
            warning = "error.schedule"
            runCatching { service.retryRebuild(recoverDue = true) }
            emptyList()
        }
        return Saved(committed, warning, service.enabled(), service.channelBlocked(), service.exact(),
            planned.firstOrNull { it.kind != "maintenance" })
    }

    private fun show(saved: Saved) {
        data = saved.data
        error = saved.error
        enabled = saved.enabled
        channelBlocked = saved.channelBlocked
        exact = saved.exact
        next = saved.next
    }
}
