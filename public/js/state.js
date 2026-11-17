// Global app state, plus the registries the feature files add their click/submit handlers to.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// Handler registries. Each feature file adds its own click/submit handlers (see events.js for how they run).
const NEXT = Symbol('next'), CLICK = [], SUBMIT = [];

// Native apps (Capacitor) have no same-origin server, so point them at the deployed API.
const API = window.Capacitor?.isNativePlatform?.() ? 'https://YOUR-APP.vercel.app' : '';

const $ = (s) => document.querySelector(s), P = {}, dlg = $('#dlg'), gd = $('#gd');

let gt;

let PL = [], MORE = [], DMORE = [];

let token = localStorage.token, me = JSON.parse(localStorage.me || 'null'), tab = 'all', reg = false, cur, poll, unread = 0, dmUnread = 0;

const pages = {};
