import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "ir.medora.health"
    compileSdk = 35
    defaultConfig {
        applicationId = "ir.medora.health.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0-preview"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    buildTypes { release { isMinifyEnabled = false } }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    testOptions { unitTests.isReturnDefaultValues = true }
}

// One SVG supplies the in-app logo, adaptive launcher icon and notification mark.
abstract class GenerateBrandResources:DefaultTask() {
    @get:InputFile abstract val sourceFile:RegularFileProperty
    @get:OutputDirectory abstract val outputDirectory:DirectoryProperty
    @TaskAction fun generate() {
        val source=sourceFile.get()
        val factory=DocumentBuilderFactory.newInstance().apply {
            setFeature("http://apache.org/xml/features/disallow-doctype-decl",true)
            setFeature("http://xml.org/sax/features/external-general-entities",false)
            setFeature("http://xml.org/sax/features/external-parameter-entities",false)
        }
        val svg=factory.newDocumentBuilder().parse(source.asFile).documentElement
        require(svg.tagName=="svg") { "branding/logo.svg must be an SVG" }
        val bounds=svg.getAttribute("viewBox").trim().split(Regex("[ ,]+" )).map(String::toFloat)
        require(bounds.size==4 && bounds[0]==0f && bounds[1]==0f && bounds[2]>0f && bounds[2]==bounds[3]) {
            "Logo viewBox must be square and start at 0 0"
        }
        val elements=svg.getElementsByTagName("*")
        val paths=(0 until elements.length).map { elements.item(it) as Element }
        require(paths.isNotEmpty() && paths.all { it.tagName=="path" }) {
            "Export logo.svg as outlined paths; groups, strokes, text and gradients are not supported"
        }
        require(!svg.hasAttribute("transform") && !svg.hasAttribute("style") && !svg.hasAttribute("stroke"))
        val rootFill=svg.getAttribute("fill").ifEmpty { "#000000" }
        fun escaped(value:String)=value.replace("&","&amp;").replace("\"","&quot;").replace("<","&lt;")
        fun pathXml(monochrome:Boolean)=paths.mapNotNull { path ->
            require(!path.hasAttribute("transform") && !path.hasAttribute("style") && !path.hasAttribute("stroke")) {
                "Export all logo strokes and transforms as plain filled paths"
            }
            val fill=path.getAttribute("fill").ifEmpty { rootFill }
            if(fill=="none")null else {
                require(fill.matches(Regex("#[0-9a-fA-F]{6}"))) { "Use six-digit hexadecimal SVG fill colors" }
                require(path.getAttribute("d").isNotBlank()) { "Logo path is empty" }
                val alpha=path.getAttribute("fill-opacity").ifEmpty { "1" }.toFloat()
                require(alpha in 0f..1f)
                val rule=path.getAttribute("fill-rule").ifEmpty { "nonzero" }
                require(rule in setOf("nonzero","evenodd"))
                "<path android:fillColor=\"${if(monochrome)"#FFFFFF" else fill}\" android:fillAlpha=\"$alpha\" android:fillType=\"${if(rule=="evenodd")"evenOdd" else "nonZero"}\" android:pathData=\"${escaped(path.getAttribute("d"))}\" />"
            }
        }.joinToString("\n")
        val size=bounds[2]
        val drawable=outputDirectory.get().dir("drawable").asFile.apply { mkdirs() }
        fun vector(viewport:Float,dp:Int,content:String)="<vector xmlns:android=\"http://schemas.android.com/apk/res/android\" android:width=\"${dp}dp\" android:height=\"${dp}dp\" android:viewportWidth=\"$viewport\" android:viewportHeight=\"$viewport\">\n$content\n</vector>\n"
        drawable.resolve("ic_brand.xml").writeText(vector(size,24,pathXml(false)))
        drawable.resolve("ic_notification.xml").writeText(vector(size,24,pathXml(true)))
        val scale=60f/size
        drawable.resolve("ic_launcher_foreground.xml").writeText(vector(108f,108,
            "<group android:translateX=\"24\" android:translateY=\"24\" android:scaleX=\"$scale\" android:scaleY=\"$scale\">\n${pathXml(false)}\n</group>"))
    }
}
val generateBrandResources=tasks.register<GenerateBrandResources>("generateBrandResources") {
    sourceFile.set(rootProject.layout.projectDirectory.file("branding/logo.svg"))
    outputDirectory.set(layout.buildDirectory.dir("generated/branding/res"))
}
androidComponents.onVariants { variant ->
    variant.sources.res?.addGeneratedSourceDirectory(generateBrandResources,GenerateBrandResources::outputDirectory)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.03.00"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.ibm.icu:icu4j:76.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.03.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
