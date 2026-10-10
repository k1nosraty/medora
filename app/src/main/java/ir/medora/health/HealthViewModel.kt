package ir.medora.health

import android.app.Application
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel

class HealthViewModel(app:Application):AndroidViewModel(app) {
    var data by mutableStateOf<HealthData?>(null);private set
    var busy by mutableStateOf(false);private set
    var error by mutableStateOf<String?>(null);private set
    var enabled by mutableStateOf(false);private set
    var exact by mutableStateOf(false);private set
    var next by mutableStateOf<Reminder?>(null);private set
    private val handler=Handler(Looper.getMainLooper())
    private val queue=SerialWorkQueue(Repository.executor) { callback ->handler.post(callback) }
    private val repo=Repository.get(app)
    private val service=Reminders(app)
    private data class Saved(val data:HealthData,val error:String?,val enabled:Boolean,val exact:Boolean,val next:Reminder?)
    init { refresh() }
    fun refresh()=change({})
    fun change(mutation:(HealthData)->Unit,onSaved:()->Unit={}) {
        busy=true;error=null
        queue.submit(work={
            val committed=repo.update(mutation)
            var warning:String?=null
            val planned=try { service.rebuild(committed) } catch(_:Exception) {
                warning="error.schedule";emptyList()
            }
            Saved(committed,warning,service.enabled(),service.exact(),planned.firstOrNull { it.kind!="maintenance" })
        },complete={ result ->
            busy=queue.pending>0
            result.fold(onSuccess={ saved ->
                data=saved.data;error=saved.error;enabled=saved.enabled;exact=saved.exact;next=saved.next
                onSaved()
            },onFailure={ error="error.storage" })
        })
    }
}
