// Mude esse número (v1, v2, v3...) sempre que atualizar o site
const VERSION = 'v1.0.1';

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Força o novo Service Worker a ativar logo
    console.log('Novo Service Worker instalado:', VERSION);
});

self.addEventListener('activate', (event) => {
    // Remove caches antigos se existirem
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== 'tarefas-cache-v1') {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Notifica todos os clientes que o Service Worker foi atualizado
    self.clients.claim();
});

// Escuta mensagens do cliente para forçar atualização
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    // Estratégia: Network First, com fallback para cache
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se a requisição funcionou, salva no cache
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open('tarefas-cache-v1').then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Se falhar, tenta do cache
                return caches.match(event.request);
            })
    );
});