import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.multiplatform") version "2.4.21"
}

group = "ir.medora"
version = "1.0"

kotlin {
    jvm {
        compilerOptions.jvmTarget.set(JvmTarget.JVM_17)
    }
    js {
        nodejs()
        useEsModules()
        binaries.library()
        outputModuleName = "care-core"
    }
    sourceSets.commonTest.dependencies {
        implementation(kotlin("test"))
    }
}

tasks.register<Sync>("buildWebEngine") {
    description = "Copy the Kotlin/JS medication engine to the PWA assets."
    from(tasks.named("compileProductionLibraryKotlinJs")) { include("**/*.mjs") }
    into(layout.projectDirectory.dir("../web/public/care-engine"))
}
