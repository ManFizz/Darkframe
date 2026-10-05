// noinspection ES6UnusedImports

// First of all: in a phone / browser (no Electron) this sets up window.darkframe
// over the network before anything reads it.
import '/src/js/Infrastructure/webBridge.js';

// Stylesheets are static imports on purpose: style-loader injects them in import
// order, so the app's overrides always land after Bootstrap. (As dynamic import()s
// the chunks raced and Bootstrap could win — blue buttons, wrong theme colours.)
import '/node_modules/bootstrap/dist/css/bootstrap.css';
import '/node_modules/bootstrap-icons/font/bootstrap-icons.css';
import '/node_modules/animate.css/animate.min.css';
import '/src/css/main.css';
import '/src/css/gallery-view.css';
import '/src/css/modal.css';
import '/src/css/sidebar.css';
import '/src/css/video-controls.css';
import '/src/css/library.css';


import ('/node_modules/bootstrap/dist/js/bootstrap.bundle.min.js');


import ('/src/js/AppInitializer.jsx');

import ('/src/js/BackendConnect');
import ('/src/js/Controllers/GalleryController.js');
