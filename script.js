// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, onValue, query, orderByChild, equalTo, remove, update, set, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// Função auxiliar para limpar o email (remover pontos)
const formatarEmail = (email) => email.replace(/\./g, '_');
let cargoUsuarioAtual = null;

// --- LOGICA DE LOGIN ---
window.fazerLogin = function() {
    const email = document.getElementById('emailLogin').value;
    const senha = document.getElementById('senhaLogin').value;
    
    // Pedir permissão de notificação ao fazer login
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    
    signInWithEmailAndPassword(auth, email, senha).catch(err => alert("Erro: " + err.message));
};

window.fazerLogout = () => signOut(auth);

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

            // Ativa as funções de Admin se for o caso
            if (cargoFinal === 'administrador') {
                document.getElementById('secaoAdmin').style.display = 'block';
                document.getElementById('secaoCriarTarefa').style.display = 'block';
                listarUsuariosParaAdmin();
                carregarListaFuncionarios();
            } else if (cargoFinal === 'gerente') {
                document.getElementById('secaoCriarTarefa').style.display = 'block';
                carregarListaFuncionarios();
            }

            carregarTarefas(user.email, cargoFinal);
            iniciarMonitorDeNotificacoes(user.email);
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
    onValue(ref(db, `usuarios/${emailLimpo}`), (snapshot) => {
        const dados = snapshot.val();
        const emailOriginal = emailLimpo.replace(/_/g, '.');

        // Preenche os campos do formulário de admin com os dados atuais
        document.getElementById('novoUserNome').value = dados.nome || "";
        document.getElementById('novoUserEmail').value = emailOriginal;
        document.getElementById('novoUserCargo').value = dados.cargo || dados;

        // Avisa o usuário que ele está editando
        alert("Dados carregados! Altere o nome ou cargo e clique em 'Cadastrar' para salvar as alterações.");
        
        // Foca no campo nome para facilitar
        document.getElementById('novoUserNome').focus();
    }, { onlyOnce: true }); 
};

// --- ATUALIZAR A LISTA DE USUÁRIOS NA TELA ---
function listarUsuariosParaAdmin() {
    onValue(ref(db, 'usuarios'), (snapshot) => {
        const lista = document.getElementById('listaUsuariosCadastrados');
        lista.innerHTML = "";
        snapshot.forEach((child) => {
            const emailLimpo = child.key;
            const emailOriginal = emailLimpo.replace(/_/g, '.');
            const dados = child.val();
            const nomeExibir = dados.nome || "Sem Nome (Editar ->)";
            const cargo = dados.cargo || dados;

    lista.innerHTML += `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
            <div>
                <div style="font-weight: 600;">${nomeExibir}</div>
                <div style="font-size: 12px; color: #64748b;">${emailOriginal} • ${cargo}</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="prepararEdicao('${emailLimpo}')" style="background:#f1f5f9; color:#475569; padding: 6px 12px;">Editar</button>
                <button onclick="removerPermissao('${emailLimpo}')" style="background:#fee2e2; color:#b91c1c; padding: 6px 12px;">Remover</button>
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
            const emailOriginal = child.key.replace(/_/g, '.');
            
            // Cria a opção: <option value="email@adm.com">Nome do Funcionario</option>
            const option = document.createElement('option');
            option.value = emailOriginal;
            option.textContent = dados.nome || emailOriginal; // Mostra o nome, se não tiver, mostra o email
            select.appendChild(option);
        });
    });
}

// Funções para controlar o Modal
window.mostrarModal = () => document.getElementById('modalSucesso').style.display = 'block';
window.fecharModal = () => document.getElementById('modalSucesso').style.display = 'none';

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
        mostrarModal(); // Aquele modal de sucesso que criamos
    });
};

// --- CARREGAR TAREFAS COM REGRAS DE BOTÕES ---
function carregarTarefas(meuEmail, cargo) {
    onValue(ref(db, 'tarefas'), (snapshot) => {
        const listaDiv = document.getElementById('listaTarefas');
        const tarefasArray = [];

        // 1. Converte o snapshot para um Array para podermos ordenar
        snapshot.forEach((child) => {
            const tarefa = child.val();
            tarefa.id = child.key;
            
            // Filtro de permissão (Admin vê tudo, Funcionario vê as dele)
            if (cargo === 'administrador' || cargo === 'gerente' || tarefa.atribuidoPara === meuEmail.toLowerCase()) {
                tarefasArray.push(tarefa);
            }
        });

        // 2. Ordena o Array (Alta = 3, Media = 2, Baixa = 1)
        const pesoUrgencia = { 'alta': 3, 'media': 2, 'baixa': 1 };
        tarefasArray.sort((a, b) => pesoUrgencia[b.urgencia] - pesoUrgencia[a.urgencia]);

        // 3. Renderiza na tela
        listaDiv.innerHTML = "";
        tarefasArray.forEach((tarefa) => {
            const corUrgencia = {
                'alta': '#ef4444',   // Vermelho
                'media': '#f59e0b',  // Amarelo/Laranja
                'baixa': '#10b981'   // Verde
            };
            
            let botaoExcluir = (cargo === 'administrador' || cargo === 'gerente') 
                ? `<button onclick="excluirTarefa('${tarefa.id}')" style="background:red; width:auto;">Excluir</button>` : "";
            
            let botaoConcluir = (tarefa.atribuidoPara === meuEmail.toLowerCase() && tarefa.status !== 'concluida')
                ? `<button onclick="concluirTarefa('${tarefa.id}')" style="background:green; width:auto;">Concluir</button>` : "";

            listaDiv.innerHTML += `
                <div class="tarefa fade-in" style="border-left: 6px solid ${corUrgencia[tarefa.urgencia] || '#ccc'}">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="font-size: 16px;">${tarefa.titulo}</strong>
                            <span class="badge" style="background: ${corUrgencia[tarefa.urgencia]}; color: white; border: 1px solid ${corUrgencia[tarefa.urgencia]}">
                                ${tarefa.urgencia.toUpperCase()}
                            </span>
                        </div>
                        <p style="margin: 8px 0; color: #475569; font-size: 14px;">${tarefa.descricao || ''}</p>
                        <div style="font-size: 12px; color: #94a3b8;">
                            📅 Entrega: ${tarefa.dataEntrega ? tarefa.dataEntrega.split('-').reverse().join('/') : 'Sem data'} | 👤 Para: ${tarefa.atribuidoPara}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        ${botaoConcluir}
                        ${botaoExcluir}
                    </div>
                </div>`;
        });
    });
}

window.concluirTarefa = (id) => update(ref(db, `tarefas/${id}`), { status: 'concluida' });
window.excluirTarefa = (id) => confirm("Excluir esta tarefa?") && remove(ref(db, `tarefas/${id}`));

// --- MONITOR DE NOTIFICAÇÕES EM SEGUNDO PLANO ---
function iniciarMonitorDeNotificacoes(meuEmail) {
    const tarefasRef = ref(db, 'tarefas');
    
    // O 'onChildAdded' detecta apenas tarefas NOVAS que entram no banco
    onChildAdded(tarefasRef, (snapshot) => {
        const tarefa = snapshot.val();
        
        // Regra: Se a tarefa for para mim e estiver pendente
        if (tarefa.atribuidoPara === meuEmail.toLowerCase() && tarefa.status === "pendente") {
            
            // Verifica se o app está em segundo plano para notificar
            if (document.visibilityState !== 'visible') {
                new Notification("Nova Tarefa Recebida! 📌", {
                    body: `${tarefa.titulo}\nUrgência: ${tarefa.urgencia}`,
                    icon: "https://cdn-icons-png.flaticon.com/512/906/906334.png"
                });
            }
        }
    });
}
