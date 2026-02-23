// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, onValue, query, orderByChild, equalTo, remove, update, set, onChildAdded, onChildChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtq1szmfIRiCGU90mtose_wEWJCpznmMM",
  authDomain: "sistema-tarefa.firebaseapp.com",
  databaseURL: "https://sistema-tarefa-default-rtdb.firebaseio.com",
  projectId: "sistema-tarefa",
  storageBucket: "sistema-tarefa.firebasestorage.app",
  messagingSenderId: "495193453337",
  appId: "1:495193453337:web:c6ba2ad6c50c3bf59ccb88",
  measurementId: "G-X717GH918B"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ADICIONE ESTA LINHA AQUI (Global)
let todasAsTarefasLocal = [];

// Variáveis para instalação PWA
let deferredPrompt;
const installContainer = document.getElementById('pwa-install-container');

// 1. Escuta o evento 'beforeinstallprompt' (Android/PC)
window.addEventListener('beforeinstallprompt', (e) => {
    // Impede que o navegador mostre o banner padrão
    e.preventDefault();
    // Salva o evento para ser disparado depois
    deferredPrompt = e;
    // Mostra o nosso botão customizado
    installContainer.style.display = 'block';
});

// 2. Função disparada pelo clique no botão
window.instalarPWA = async () => {
    if (!deferredPrompt) return;
    
    // Mostra o prompt de instalação
    deferredPrompt.prompt();
    
    // Espera a resposta do usuário
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Usuário respondeu à instalação: ${outcome}`);
    
    // Limpa o prompt para não ser usado de novo
    deferredPrompt = null;
    installContainer.style.display = 'none';
};

// 3. Esconde o botão se o app já estiver instalado
window.addEventListener('appinstalled', () => {
    installContainer.style.display = 'none';
    deferredPrompt = null;
    mostrarSucesso("Aplicativo instalado com sucesso!");
});

// 4. Detecta iOS e mostra instrução especial
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

if (isIOS && !isStandalone) {
    console.log("Usuário de iPhone detectado. Sugerir instalação via Safari.");
}

// Função para permitir login ao apertar Enter
const inputsLogin = [document.getElementById('emailLogin'), document.getElementById('senhaLogin')];

inputsLogin.forEach(input => {
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('btnLogar').click();
        }
    });
});

// Variável global para controle de exclusão
let idParaExcluir = null;

// Função auxiliar para limpar o email (remover pontos)
const formatarEmail = (email) => email.replace(/\./g, '_');
let cargoUsuarioAtual = null;
window.fazerLogin = function() {
    const email = document.getElementById('emailLogin').value;
    const senha = document.getElementById('senhaLogin').value;
    
    // Pedir permissão de notificação ao fazer login
    solicitarNotificacao();
    
    signInWithEmailAndPassword(auth, email, senha).catch(err => alert("Erro: " + err.message));
};

// --- SOLICITAR PERMISSÃO DE NOTIFICAÇÃO ---
window.solicitarNotificacao = () => {
    // Se já deu permissão antes, não pede de novo
    if (localStorage.getItem('notificacaoAtiva') === 'true') {
        return;
    }
    
    Notification.requestPermission().then(perm => {
        if (perm === "granted") {
            localStorage.setItem('notificacaoAtiva', 'true');
            mostrarSucesso("Notificações ativadas!");
        }
    });
};

window.fazerLogout = () => signOut(auth);

// Função que apenas abre o modal
window.logout = function() {
    abrirModal('modalSair');
};

// Função que realmente desloga quando clicar em "Sim, Sair" no modal
document.getElementById('btnConfirmarSair').onclick = function() {
    signOut(auth).then(() => {
        fecharModal('modalSair');
        // O onAuthStateChanged vai detectar o logout e mostrar a tela de login
    }).catch((error) => {
        alert("Erro ao sair: " + error.message);
    });
};

// --- MONITORAR USUÁRIO LOGADO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        const emailLimpo = formatarEmail(user.email);
        
        onValue(ref(db, `usuarios/${emailLimpo}`), (snapshot) => {
            const dados = snapshot.val();
            let cargoFinal = "funcionario";
            let nomeFinal = user.email;

            if (dados) {
                // Se for um objeto (formato novo)
                if (typeof dados === 'object') {
                    cargoFinal = dados.cargo || "funcionario";
                    nomeFinal = dados.nome || user.email;
                } 
                // Se for apenas o texto (formato antigo)
                else {
                    cargoFinal = dados;
                }
            }

            // Atualiza a tela
            document.getElementById('telaLogin').style.display = 'none';
            document.getElementById('sistema').style.display = 'block';
            document.getElementById('usuarioLogado').innerText = nomeFinal;
            document.getElementById('cargoUsuario').innerText = cargoFinal;
            
            // Armazena o cargo atual para uso em outras funções
            cargoUsuarioAtual = cargoFinal;

            // Ativa as funções de Admin se for o caso
            if (cargoFinal === 'administrador') {
                document.getElementById('botoes-acao').style.display = 'flex';
                listarUsuariosParaAdmin();
                carregarListaFuncionarios();
            } else if (cargoFinal === 'gerente') {
                document.getElementById('botoes-acao').style.display = 'flex';
                // Esconde o botão de usuário para gerentes
                document.querySelector('button[onclick="abrirModal(\'modalUser\')"]').style.display = 'none';
                carregarListaFuncionarios();
            }

            carregarTarefas(user.email, cargoFinal);
            
            // Inicia monitor de notificações só se já deu permissão antes
            if (localStorage.getItem('notificacaoAtiva') === 'true') {
                iniciarMonitorDeNotificacoes(user.email);
            }
        });
    } else {
        document.getElementById('telaLogin').style.display = 'block';
        document.getElementById('sistema').style.display = 'none';
    }
});

// --- FUNÇÃO PARA CRIAR/EDITAR USUÁRIO (INTELIGENTE) ---
window.criarUsuarioCompleto = async function() {
    const nome = document.getElementById('novoUserNome').value;
    const email = document.getElementById('novoUserEmail').value.trim();
    const senha = document.getElementById('novoUserSenha').value;
    const cargo = document.getElementById('novoUserCargo').value;

    if (!nome || !email) {
        alert("Pelo menos Nome e E-mail são obrigatórios!");
        return;
    }

    const emailLimpo = formatarEmail(email);

    try {
        // Tenta salvar os dados no Banco (isso funciona para novo ou edição)
        await set(ref(db, `usuarios/${emailLimpo}`), {
            nome: nome,
            cargo: cargo
        });

        // Só tenta criar o login no Authentication se uma senha foi digitada
        // E se for um usuário novo (o try/catch vai lidar se já existir)
        if (senha.length >= 6) {
            try {
                await createUserWithEmailAndPassword(auth, email, senha);
            } catch (authError) {
                if (authError.code === 'auth/email-already-in-use') {
                    console.log("Usuário já tem login, apenas os dados do banco foram atualizados.");
                } else {
                    throw authError; // Se for outro erro de auth, avisa
                }
            }
        }

        alert(`Dados de ${nome} atualizados com sucesso!`);
        
        // Limpa os campos
        document.getElementById('novoUserNome').value = "";
        document.getElementById('novoUserEmail').value = "";
        document.getElementById('novoUserSenha').value = "";
        fecharModal('modalUser'); // Fecha o modal após salvar
        mostrarSucesso(`Dados de ${nome} atualizados com sucesso!`);
        
    } catch (error) {
        alert("Erro ao processar: " + error.message);
    }
};

// --- FUNÇÃO PARA REMOVER PERMISSÃO ---
window.removerPermissao = function(emailLimpo) {
    const emailExibir = emailLimpo.replace(/_/g, '.');
    if (confirm(`Deseja remover o acesso de ${emailExibir}?`)) {
        remove(ref(db, `usuarios/${emailLimpo}`))
            .then(() => alert("Acesso removido!"))
            .catch(err => alert("Erro: " + err.message));
    }
};

// --- FUNÇÃO PARA CARREGAR DADOS NO FORMULÁRIO ---
window.prepararEdicao = function(emailLimpo) {
    abrirModal('modalUser'); // Abre a janela quando clica em editar
    
    onValue(ref(db, `usuarios/${emailLimpo}`), (snapshot) => {
        const dados = snapshot.val();
        const emailOriginal = emailLimpo.replace(/_/g, '.');

        // Preenche os campos do formulário de admin com os dados atuais
        document.getElementById('novoUserNome').value = dados.nome || "";
        document.getElementById('novoUserEmail').value = emailOriginal;
        document.getElementById('novoUserCargo').value = dados.cargo || dados;
        document.getElementById('novoUserSenha').value = ""; // Limpa senha para edição

        // Foca no campo nome para facilitar
        document.getElementById('novoUserNome').focus();
    }, { onlyOnce: true }); 
};

// --- ATUALIZAR A LISTA DE USUÁRIOS NA TELA ---
function listarUsuariosParaAdmin() {
    const listaContainer = document.getElementById('listaUsuariosAdmin');
    
    onValue(ref(db, 'usuarios'), (snapshot) => {
        listaContainer.innerHTML = ""; // Limpa a lista antes de carregar
        
        snapshot.forEach((child) => {
            const dados = child.val();
            const emailLimpo = child.key;
            const emailOriginal = emailLimpo.replace(/_/g, '.');
            const nomeExibir = dados.nome || emailOriginal;
            const cargo = dados.cargo || "funcionario";

            listaContainer.innerHTML += `
                <div class="user-item-mobile">
                    <div class="user-info-text">
                        <strong>${nomeExibir}</strong>
                        <span>${emailOriginal} | ${cargo}</span>
                    </div>
                    <div class="user-actions">
                        <button onclick="prepararEdicao('${emailLimpo}')">✎</button>
                        <button onclick="removerPermissao('${emailLimpo}')">✕</button>
                    </div>
                </div>`;
        });
    });
}

// --- CARREGAR LISTA DE FUNCIONÁRIOS NO SELECT ---
function carregarListaFuncionarios() {
    const select = document.getElementById('atribuidoPara');
    
    onValue(ref(db, 'usuarios'), (snapshot) => {
        // Limpa o select mas mantém a primeira opção
        select.innerHTML = '<option value="">Selecione um funcionário...</option>';
        
        snapshot.forEach((child) => {
            const dados = child.val();
            const emailOriginal = child.key.replace(/_/g, '.'); // Converte admin_gmail_com de volta
            const nomeExibir = dados.nome || emailOriginal;

            // Criamos a opção: O texto é o Nome, o Valor é o E-mail
            const option = document.createElement('option');
            option.value = emailOriginal;
            option.text = nomeExibir;
            select.appendChild(option);
        });
    });
}

// Função para mostrar e-mail selecionado
window.mostrarEmailSelecionado = function() {
    const select = document.getElementById('atribuidoPara');
    const emailDiv = document.getElementById('emailAuxiliar');
    
    // O valor do select é o e-mail (ex: funcionario@gmail.com)
    const email = select.value;
    
    if (email) {
        emailDiv.innerText = `Destinatário: ${email}`;
    } else {
        emailDiv.innerText = "";
    }
};

// Funções para controlar os Modais
window.abrirModal = function(id) {
    document.getElementById(id).style.display = 'flex';
};

window.fecharModal = function(id) {
    document.getElementById(id).style.display = 'none';
};

// Modal de Sucesso Universal
window.mostrarSucesso = function(mensagem) {
    document.getElementById('mensagemSucesso').innerText = mensagem;
    abrirModal('modalSucesso');
    
    // Fecha sozinho após 3 segundos
    setTimeout(() => {
        fecharModal('modalSucesso');
    }, 3000);
};

// --- SALVAR TAREFA (Criar para outro) ---
window.salvarTarefa = function() {
    const titulo = document.getElementById('titulo').value;
    const desc = document.getElementById('descricao').value;
    const data = document.getElementById('dataEntrega').value;
    const urgencia = document.getElementById('urgencia').value;
    const para = document.getElementById('atribuidoPara').value;

    if (!titulo || !para || !data) {
        alert("Por favor, preencha Título, Data e Responsável!");
        return;
    }

    push(ref(db, 'tarefas'), {
        titulo: titulo,
        descricao: desc,
        dataEntrega: data,
        urgencia: urgencia,
        atribuidoPara: para.toLowerCase(),
        criadoPor: auth.currentUser.email,
        status: "pendente",
        timestamp: Date.now()
    }).then(() => {
        // Limpa os campos após salvar
        document.getElementById('titulo').value = "";
        document.getElementById('descricao').value = "";
        document.getElementById('dataEntrega').value = "";
        fecharModal('modalTarefa'); // Fecha o modal após salvar
        mostrarSucesso('Tarefa enviada com sucesso!');
    });
};

// --- CARREGAR TAREFAS COM REGRAS DE BOTÕES ---
function carregarTarefas(meuEmail, cargo) {
    onValue(ref(db, 'tarefas'), (snapshot) => {
        const pendentesDiv = document.getElementById('listaTarefasPendentes');
        const concluidasDiv = document.getElementById('listaTarefasConcluidas');
        
        const tarefasPendentes = [];
        const tarefasConcluidas = [];

        snapshot.forEach((child) => {
            const tarefa = child.val();
            tarefa.id = child.key;
            
            // Filtro de Visibilidade (Mesma lógica sua)
            if (cargo === 'administrador' || cargo === 'gerente' || tarefa.atribuidoPara === meuEmail.toLowerCase()) {
                if (tarefa.status === 'concluida') {
                    tarefasConcluidas.push(tarefa);
                } else {
                    tarefasPendentes.push(tarefa);
                }
            }
        });

        // Armazena todas as tarefas localmente para busca
        todasAsTarefasLocal = [...tarefasPendentes, ...tarefasConcluidas];

        // Atualiza Badges do Dashboard e das Seções
        document.getElementById('countPendentes').innerText = tarefasPendentes.length;
        document.getElementById('countConcluidas').innerText = tarefasConcluidas.length;
        document.getElementById('badgePendentes').innerText = tarefasPendentes.length;
        document.getElementById('badgeConcluidas').innerText = tarefasConcluidas.length;

        // Renderização inicial (sem filtro)
        renderizarCards(tarefasPendentes, pendentesDiv, meuEmail, cargo, false);
        renderizarCards(tarefasConcluidas, concluidasDiv, meuEmail, cargo, true);
    });
}

// Função para renderizar os cards de tarefas
function renderizarCards(tarefas, container, meuEmail, cargo, ehConcluida) {
    container.innerHTML = '';
    
    tarefas.forEach(tarefa => {
        // Determina a cor da urgência
        let corUrgencia = '#10b981'; // verde por padrão
        if (tarefa.urgencia === 'media') corUrgencia = '#f59e0b';
        if (tarefa.urgencia === 'alta') corUrgencia = '#ef4444';
        
        // Cria o botão de excluir apenas para admin/gerente
        let btnExcluir = "";
        if (cargo === 'administrador' || cargo === 'gerente') {
            btnExcluir = `<button onclick="excluirTarefa('${tarefa.id}', '${tarefa.titulo}')" style="background:var(--danger); border:none; color:white; border-radius:8px; padding: 8px 12px; cursor:pointer;">✕</button>`;
        }
        
        // Cria o botão de concluir apenas para tarefas pendentes
        let btnConcluir = "";
        if (!ehConcluida && tarefa.atribuidoPara === meuEmail.toLowerCase()) {
            btnConcluir = `<button onclick="concluirTarefa('${tarefa.id}')" style="background:var(--success); border:none; color:white; border-radius:8px; padding: 8px 12px; cursor:pointer;">✓</button>`;
        }
        
        const card = `
            <div class="tarefa-card" style="border-left: 4px solid ${corUrgencia};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 8px 0; color: #1e293b;">${tarefa.titulo}</h4>
                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">${tarefa.descricao || 'Sem descrição'}</p>
                        <div style="display: flex; gap: 10px; align-items: center; font-size: 12px;">
                            <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">📅 ${tarefa.dataEntrega}</span>
                            <span style="background: ${corUrgencia}20; color: ${corUrgencia}; padding: 4px 8px; border-radius: 4px;">${tarefa.urgencia}</span>
                            <span style="background: #e0e7ff; color: #6366f1; padding: 4px 8px; border-radius: 4px;">👤 ${tarefa.atribuidoPara}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; margin-left: 10px;">
                        ${btnConcluir}
                        ${btnExcluir}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML += card;
    });
    
    // Se não há tarefas, mostra mensagem
    if (tarefas.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 40px;">Nenhuma tarefa ${ehConcluida ? 'concluída' : 'pendente'} encontrada.</div>`;
    }
}

// 1. Função para abrir/fechar seções
window.toggleSecao = function(idLista, idSeta) {
    const lista = document.getElementById(idLista);
    const seta = document.getElementById(idSeta);
    
    if (lista.style.display === "none") {
        lista.style.display = "block";
        seta.innerText = "▼";
    } else {
        lista.style.display = "none";
        seta.innerText = "▶";
    }
};

// 2. Função de Busca/Filtro
window.filtrarTarefas = function() {
    const termo = document.getElementById('inputBusca').value.toLowerCase();
    const meuEmail = auth.currentUser ? auth.currentUser.email : "";
    const cargo = cargoUsuarioAtual || "funcionario";
    
    if (!termo) {
        // Se não há termo, mostra todas as tarefas
        renderizarCards(todasAsTarefasLocal.filter(t => t.status !== 'concluida'), document.getElementById('listaTarefasPendentes'), meuEmail, cargo, false);
        renderizarCards(todasAsTarefasLocal.filter(t => t.status === 'concluida'), document.getElementById('listaTarefasConcluidas'), meuEmail, cargo, true);
        return;
    }
    
    const pendentesFiltradas = todasAsTarefasLocal.filter(t => 
        t.status !== 'concluida' && (t.titulo.toLowerCase().includes(termo) || t.descricao.toLowerCase().includes(termo))
    );
    const concluidasFiltradas = todasAsTarefasLocal.filter(t => 
        t.status === 'concluida' && (t.titulo.toLowerCase().includes(termo) || t.descricao.toLowerCase().includes(termo))
    );
    
    renderizarCards(pendentesFiltradas, document.getElementById('listaTarefasPendentes'), meuEmail, cargo, false);
    renderizarCards(concluidasFiltradas, document.getElementById('listaTarefasConcluidas'), meuEmail, cargo, true);
};

window.concluirTarefa = (id) => {
    update(ref(db, `tarefas/${id}`), { 
        status: 'concluida',
        dataConclusao: new Date().toISOString() // Adiciona um registro de quando foi feito
    }).then(() => {
        // Opcional: Se o próprio funcionário quiser um aviso ao clicar
        mostrarSucesso("Tarefa marcada como concluída!");
    });
};

window.excluirTarefa = function(id, titulo) {
    idParaExcluir = id; // Armazena o ID
    document.getElementById('nomeTarefaExcluir').innerText = `"${titulo}"`; // Mostra o nome no modal
    abrirModal('modalConfirmacao');
};

// Configura o botão "Sim, Excluir" do modal
document.getElementById('btnConfirmarExcluir').onclick = function() {
    if (idParaExcluir) {
        const tarefaRef = ref(db, `tarefas/${idParaExcluir}`);
        remove(tarefaRef)
            .then(() => {
                fecharModal('modalConfirmacao');
                mostrarSucesso("Tarefa removida com sucesso!");
                idParaExcluir = null;
            })
            .catch((error) => alert("Erro ao excluir: " + error.message));
    }
};

// --- MONITOR DE NOTIFICAÇÕES EM SEGUNDO PLANO ---
function iniciarMonitorDeNotificacoes(meuEmail) {
    const tarefasRef = ref(db, 'tarefas');
    
    // O 'onChildAdded' detecta apenas tarefas NOVAS que entram no banco
    onChildAdded(tarefasRef, (snapshot) => {
        const tarefa = snapshot.val();
        
        // Regra: Se a tarefa for para mim e estiver pendente
        if (tarefa.atribuidoPara === meuEmail.toLowerCase() && tarefa.status === "pendente") {
            
            // Toca o som de notificação
            dispararAvisoSonoro();
            
            // Verifica se o app está em segundo plano para notificar
            if (document.visibilityState !== 'visible') {
                new Notification("Nova Tarefa Recebida! 📌", {
                    body: `${tarefa.titulo}\nUrgência: ${tarefa.urgencia}`,
                    icon: "https://cdn-icons-png.flaticon.com/512/906/906334.png"
                });
            }
        }
    });
    
    // O 'onChildChanged' detecta quando uma tarefa é CONCLUÍDA
    onChildChanged(tarefasRef, (snapshot) => {
        const tarefa = snapshot.val();
        const meuEmail = auth.currentUser ? auth.currentUser.email : "";
        
        // REGRA: Se EU criei a tarefa e ela foi marcada como 'concluida'
        if (tarefa.criadoPor === meuEmail && tarefa.status === "concluida") {
            
            // 1. Notificação Visual (Modal na tela do App)
            mostrarSucesso(`Tarefa Concluída: "${tarefa.titulo}"`);

            // 2. Notificação de Sistema (Balãozinho/Push)
            if (Notification.permission === "granted") {
                new Notification("Tarefa Concluída! ✅", {
                    body: `O colaborador finalizou: ${tarefa.titulo}`,
                    icon: "https://cdn-icons-png.flaticon.com/512/190/190411.png"
                });
            }
        }
    });
}

// Função para disparar som de notificação
window.dispararAvisoSonoro = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log("Áudio aguardando interação..."));
};
