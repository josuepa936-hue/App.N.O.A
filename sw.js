const CACHE =
  'noa-mobile-v6-39';


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

  './noa-192.png',

  './noa-512.png'

];


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

      caches
        .keys()
        .then(keys =>

          Promise.all(

            keys
              .filter(
                key =>
                  key !== CACHE
              )
              .map(
                key =>
                  caches.delete(key)
              )

          )

        )
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


    // NO interceptar recursos
    // de otros dominios.
    if(
      url.origin !==
      self.location.origin
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
            caches.match(
              './index.html'
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
        .match(request)

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
