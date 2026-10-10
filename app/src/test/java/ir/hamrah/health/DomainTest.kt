package ir.hamrah.health
import org.junit.Test
import org.junit.Assert.assertEquals
class DomainTest {
    @Test fun healthScenarios() { assertEquals(52,CoreChecks.run()) }
}
