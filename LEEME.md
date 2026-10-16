# Słówka — app Android de polaco de Daniel

Curso de polaco como un viaje por las paradas del metro de Varsovia (M1 y M2): cada parada es una
situación de la vida real (compras, médico, oficina, vecinos…). Funciona sin internet.

## Qué hay aquí
- `android/app/src/main/assets/`: la app (HTML/JS/CSS) que corre dentro de un WebView.
  - `curso.js`: el contenido (12 unidades, 123 palabras, diálogos, 8 sonidos del laboratorio).
  - `previo.js`: el progreso que Daniel traía de la app web Słówka (se carga solo la primera vez).
  - `app.js`: motor (repaso espaciado con cajas 0-5, lecciones, pronunciación, diálogos, laboratorio).
- `android/app/src/main/java/pl/daniel/slowka/`: lo nativo: voz polaca (TextToSpeech pl-PL),
  reconocimiento de voz pl-PL para puntuar la pronunciación, vibración, recordatorio diario.
- El progreso vive en el localStorage del WebView (datos de la app). Copia de seguridad en Ajustes.

## Compilar y publicar
- GitHub Actions (`.github/workflows/compilar.yml`) compila en cada PR y, al hacer merge a `main`,
  publica una Release con `Slowka.apk`. Versiones fijas: JDK 17, SDK 34, build-tools 34.0.0, Gradle 8.7, AGP 8.5.2.
- **Sube `versionCode`** en `android/app/build.gradle` en cada versión y escribe `android/novedades.txt`.
- La app mira `releases/latest` y muestra la barra **Update** si hay un versionCode mayor.

## Firma (no tocar)
- La llave está SOLO en el secret `FIRMA_SLOWKA` (tar.gz en base64 con `slowka.p12` y `clave.txt`).
  Copia de seguridad en la carpeta del proyecto de Claude: `polaco/app-android/firma/`.
- El workflow comprueba que la APK lleva la huella `HUELLA`. Si la firma cambiara, Android no dejaría
  instalar encima y Daniel perdería su progreso.
