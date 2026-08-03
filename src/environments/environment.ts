// Configuración de desarrollo/staging. Reemplazada por environment.production.ts
// en builds con configuración "production" (ver angular.json > fileReplacements).
//
// El proyecto Firebase es compartido con Comandante y Babel (ADR-010 en
// docs/MEMORY.md): Ágora no registra una app web propia, reutiliza este
// mismo `firebaseConfig` tal cual. Estos valores identifican el proyecto
// para inicializar el SDK cliente; no son el mecanismo de autorización
// (CLAUDE.md §5, A02) — no son sensibles y pueden vivir en el repo.
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyCKZLrWGC-O_piAf5JFyvCueNQOVNS75X4',
    authDomain: 'comandante-letiende.firebaseapp.com',
    projectId: 'comandante-letiende',
    storageBucket: 'comandante-letiende.firebasestorage.app',
    messagingSenderId: '458748050433',
    appId: '1:458748050433:web:441a0ec326f149ab08d400',
  },
};
