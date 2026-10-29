const CACHE_SCOPE = self.registration.scope;
const CACHE_PREFIX =
  'noa-mobile:' + encodeURIComponent(CACHE_SCOPE) + ':';
const CACHE = CACHE_PREFIX + 'v6-65';


const ASSETS = [

  './',

  './index.html',

  './manifest.webmanifest',

  './excoba_master.js',

  './excoba_patch_v3.js',

  './excoba_patch_v4.js',

  './excoba_patch_v5.js',

  './excoba_patch_v6_sources.js',

  './excoba_patch_v7_realism.js',

  './excoba_patch_v8_blueprint.js',

  './excoba_patch_v9_generator.js',

  './excoba_patch_v10_batch.js',

  './excoba_patch_v11_drag_classify.js',

  './excoba_patch_v12_drag_renderer.js',

  './excoba_patch_v13_mixed_exam.js',

  './excoba_patch_v14_inline_select.js',

  './excoba_patch_v15_inline_renderer.js',

  './excoba_patch_v16_inline_mixed.js',

  './excoba_patch_v17_drag_order.js',

  './excoba_patch_v18_drag_order_renderer.js',

  './excoba_patch_v19_drag_order_mixed.js',

  './excoba_patch_v20_exam_shell.js',

  './excoba_patch_v21_exam_navigation.js',

  './excoba_patch_v22_answer_revision.js',

  './excoba_patch_v23_results_engine.js',

  './excoba_patch_v24_generator_ui.js',

  './noa-192.png',

  './noa-512.png'

];

const ASSET_URLS = new Set(
  ASSETS.map(asset => new URL(asset, CACHE_SCOPE).href)
);

async function removeOldCaches(){
  const keys = await caches.keys();

  await Promise.all(keys.map(async key => {
    if(key === CACHE){
      return;
    }

    if(key.startsWith(CACHE_PREFIX)){
      await caches.delete(key);
      return;
    }

    // Older releases shared a cache name across projects. Remove it only
    // when every entry belongs to this installation's known app shell.
    if(/^noa-mobile-v\d+-\d+$/.test(key)){
      const cache = await caches.open(key);
      const requests = await cache.keys();
      const indexURL = new URL('./index.html', CACHE_SCOPE).href;

      if(
        requests.some(request => request.url === indexURL) &&
        requests.every(request => ASSET_URLS.has(request.url))
      ){
        await caches.delete(key);
      }
    }
  }));
}


// =====================================
// INSTALACIÓN
// =====================================

self.addEventListener(
  'install',

  event => {

    event.waitUntil(

      caches
        .open(CACHE)
        .then(cache =>
          cache.addAll(ASSETS)
        )
        .then(() =>
          self.skipWaiting()
        )

    );

  }
);


// =====================================
// ACTIVACIÓN
// =====================================

self.addEventListener(
  'activate',

  event => {

    event.waitUntil(

      removeOldCaches()
        .then(() =>
          self.clients.claim()
        )

    );

  }
);


// =====================================
// RED
// =====================================

self.addEventListener(
  'fetch',

  event => {

    const request =
      event.request;


    // Solo GET
    if(
      request.method !== 'GET'
    ){
      return;
    }


    const url =
      new URL(request.url);


    // Solo recursos del proyecto que registró este service worker.
    if(
      url.origin !==
      self.location.origin ||
      !url.href.startsWith(CACHE_SCOPE)
    ){
      return;
    }


    // =================================
    // NAVEGACIÓN
    // =================================

    if(
      request.mode ===
      'navigate'
    ){

      event.respondWith(

        fetch(request)

          .catch(() =>
            caches.open(CACHE).then(cache =>
              cache.match(new URL('./index.html', CACHE_SCOPE).href)
            )
          )

      );

      return;

    }


    // =================================
    // RECURSOS ESTÁTICOS
    // =================================

    event.respondWith(

      caches
        .open(CACHE)
        .then(cache => cache.match(request))

        .then(cached => {

          if(cached){
            return cached;
          }


          return fetch(request)
            .then(response => {

              if(
                response &&
                response.ok
              ){

                const copy =
                  response.clone();


                caches
                  .open(CACHE)
                  .then(cache =>
                    cache.put(
                      request,
                      copy
                    )
                  );

              }


              return response;

            });

        })

    );

  }
);
