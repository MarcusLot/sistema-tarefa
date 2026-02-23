// Mude esse número (v1, v2, v3...) sempre que atualizar o site
const VERSION = 'v1.0.4'; // Lembre de subir a versão aqui!
const CACHE_NAME = 'tarefas-cache-' + VERSION;

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
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Notifica todos os clientes que o Service Worker foi atualizado
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // CORREÇÃO AQUI: Só tenta fazer cache se for método GET
    // O Firebase e Logins usam POST/PUT e isso NÃO pode ir para o cache
    if (event.request.method !== 'GET') {
        return; 
    }

    // Estratégia: Network First, com fallback para cache
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se a requisição funcionou, salva no cache
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
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

// Escuta mensagens do cliente para forçar atualização
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Evento para abrir o app ao clicar na notificação
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/') // Abre o app ao clicar na notificação
    );
});