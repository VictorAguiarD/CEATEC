document.addEventListener('DOMContentLoaded', function() {

    // ========= Utilitários =========
    function formatISO(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
    function isoToBR(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
    function parseBRtoIso(br) { if (!br) return ''; const [d, m, y] = br.split('/'); if (!y) return ''; return `${y}-${m}-${d}`; }
    function money(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function daysDiff(iso) { if (!iso) return Infinity; const t = new Date(iso); t.setHours(0, 0, 0, 0); const today = new Date(); today.setHours(0, 0, 0, 0); return Math.ceil((t - today) / (1000 * 3600 * 24)); }
    function addDays(iso, n) { const d = new Date(iso || formatISO(new Date())); d.setDate(d.getDate() + n); return formatISO(d); }

    // ========= Estado & Persistência =========
    const LS_KEY = 'gestor_os_full_v3';
    const LS_BACKUPS = 'gestor_os_backups_v3';
    let state = { registros: [] };

    function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    function loadState() { try { const raw = localStorage.getItem(LS_KEY); if (raw) state = JSON.parse(raw); } catch (e) { state = { registros: [] }; } }

    // ========= Referências de UI =========
    const fileImport = document.getElementById('fileImport');
    const importBtn = document.getElementById('importBtn');
    const exportXlsxBtn = document.getElementById('exportXlsxBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const downloadJsonBtn = document.getElementById('downloadJsonBtn');
    const clienteEl = document.getElementById('cliente');
    const tipoEl = document.getElementById('tipoCliente');
    const dataSaidaEl = document.getElementById('dataSaida');
    const osEl = document.getElementById('osNumero');
    const equipamentoEl = document.getElementById('equipamento');
    const quantidadeEl = document.getElementById('quantidade');
    const custoEl = document.getElementById('custo');
    const totalEl = document.getElementById('total');
    const sinalEl = document.getElementById('sinal');
    const parcela1El = document.getElementById('parcela1');
    const parcela2El = document.getElementById('parcela2');
    const dataParcela1El = document.getElementById('dataParcela1');
    const dataParcela2El = document.getElementById('dataParcela2');
    const pagamentoRealizadoEl = document.getElementById('pagamentoRealizado');
    const salvarBtn = document.getElementById('salvarBtn');
    const limparBtn = document.getElementById('limparBtn');
    const carregarBtn = document.getElementById('carregarBtn');
    const duplicarBtn = document.getElementById('duplicarBtn');
    const excluirBtn = document.getElementById('excluirBtn');
    const tableBody = document.querySelector('#tableOS tbody');
    const dashTotal = document.getElementById('dashTotal');
    const dashRecebido = document.getElementById('dashRecebido');
    const dashDevendo = document.getElementById('dashDevendo');
    const dashAtivas = document.getElementById('dashAtivas');
    const chartFaturado = document.getElementById('chartFaturado');
    const chartRec = document.getElementById('chartRecebido');
    const chartDev = document.getElementById('chartDevendo');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const backupsList = document.getElementById('backupsList');
    const modalBackups = document.getElementById('modalBackups');
    const fecharModalBtn = document.getElementById('fecharModalBtn');
    const filtroClienteEl = document.getElementById('filtroCliente');
    const filtroOSEl = document.getElementById('filtroOS');
    const filtroDataEl = document.getElementById('filtroData');
    const limparFiltrosBtn = document.getElementById('limparFiltrosBtn');
    
    let editingId = null;
    let selectedRowId = null;

    // =======================================================================
    // SEÇÃO DE IMPORTAÇÃO (ADAPTADA DO SEU CÓDIGO AVANÇADO)
    // =======================================================================
    const ImportManager = {
        async handleFile(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const name = file.name.toLowerCase();

            try {
                if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    if (typeof XLSX === 'undefined') throw new Error("Biblioteca SheetJS (XLSX) não carregou a tempo.");
                    const data = await file.arrayBuffer();
                    const workbook = XLSX.read(data);
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    this.processRows(json);
                } else if (name.endsWith('.csv')) {
                    if (typeof Papa === 'undefined') throw new Error("Biblioteca PapaParse não carregou a tempo.");
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => this.processRows(results.data),
                        error: (err) => { throw new Error(err.message); }
                    });
                } else {
                    alert('Formato não suportado. Envie arquivos .xlsx ou .csv');
                }
            } catch (error) {
                console.error('Erro ao processar arquivo:', error);
                alert('Erro ao processar arquivo: ' + error.message);
            }

            e.target.value = '';
        },

        processRows(rows) {
            let added = 0, skipped = 0, replaced = 0;

            rows.forEach(row => {
                const record = this.mapRowToRecord(row);
                if (!record || !record.OS) {
                    skipped++;
                    return;
                }

                const existingIndex = state.registros.findIndex(r => r.OS === record.OS);
                if (existingIndex >= 0) {
                    const choice = confirm(`OS duplicada encontrada: "${record.OS}". Deseja substituir o registro existente?`);
                    if (choice) {
                        record.id = state.registros[existingIndex].id;
                        state.registros[existingIndex] = record;
                        replaced++;
                    } else {
                        skipped++;
                    }
                } else {
                    state.registros.push(record);
                    added++;
                }
            });

            saveState();
            applyFilters();
            updateDashboard();
            alert(`Importação concluída!\nAdicionados: ${added}\nSubstituídos: ${replaced}\nIgnorados: ${skipped}`);
        },

        mapRowToRecord(row) {
            const lower = Object.keys(row).reduce((acc, k) => {
                acc[String(k).toLowerCase().trim().replace(/[^a-z0-9]/g, '')] = row[k];
                return acc;
            }, {});

            const os = lower['os'] || lower['ordemdeservico'] || '';
            if (!os) return null;

            const cliente = lower['cliente'] || lower['nome'] || '';
            const tipoCliente = String(lower['tipocliente'] || lower['tipo'] || '15').includes('30') ? '30 dias' : '15 dias';
            const equipamento = lower['equipamento'] || lower['produto'] || '';
            const quantidade = Number(lower['quantidade'] || lower['qtd'] || 1);
            const custo = Number(String(lower['custo'] || lower['valorunitario'] || 0).replace(',', '.'));
            const total = Number(String(lower['total'] || 0).replace(',', '.')) || (quantidade * custo);

            const parseDate = (dateValue) => {
                if (!dateValue) return '';
                if (typeof dateValue === 'number') {
                    return formatISO(new Date(Math.round((dateValue - 25569) * 86400 * 1000)));
                }
                if (String(dateValue).includes('/')) {
                    return parseBRtoIso(String(dateValue));
                }
                const d = new Date(dateValue);
                return !isNaN(d) ? formatISO(d) : '';
            };

            const dataSaida = parseDate(lower['datasaida'] || lower['saida']) || formatISO(new Date());
            const dataP1 = parseDate(lower['dataparcela1'] || lower['datap1']);
            const dataP2 = parseDate(lower['dataparcela2'] || lower['datap2']);

            const pagoStr = String(lower['pagamentorealizado'] || lower['pago'] || '').toLowerCase();
            const pagoSinal = pagoStr.includes('sinal') || pagoStr.includes('sim');

            const record = {
                id: `r${Date.now()}-${Math.random().toString(16).slice(2)}`,
                CLIENTE: String(cliente),
                TIPO_CLIENTE: tipoCliente,
                DATA_SAIDA_ISO: dataSaida,
                DATA_PARCELA1_ISO: dataP1,
                DATA_PARCELA2_ISO: dataP2,
                SINAL: Number(String(lower['sinal'] || (total * 0.5)).replace(',', '.')),
                PARCELA_1: Number(String(lower['parcela1'] || lower['p1'] || (tipoCliente === '15 dias' ? total * 0.25 : total * 0.5)).replace(',', '.')),
                PARCELA_2: Number(String(lower['parcela2'] || lower['p2'] || (tipoCliente === '15 dias' ? total * 0.25 : 0)).replace(',', '.')),
                EQUIPAMENTO: String(equipamento),
                OS: String(os),
                QUANTIDADE: quantidade,
                CUSTO: custo,
                TOTAL: total,
                PAGO_SINAL: pagoSinal,
                PAGO_SINAL_DATA: pagoSinal ? formatISO(new Date()) : '',
                PAGO_P1: pagoStr.includes('p1'),
                PAGO_P1_DATA: pagoStr.includes('p1') ? formatISO(new Date()) : '',
                PAGO_P2: pagoStr.includes('p2'),
                PAGO_P2_DATA: pagoStr.includes('p2') ? formatISO(new Date()) : '',
            };
            
            record.DEVENDO = calcDevendo(record);
            return record;
        }
    };

    // =======================================================================
    // RESTANTE DO CÓDIGO (Funções de renderização, CRUD, etc.)
    // =======================================================================

    function init() {
        loadState();
        if (!state.registros) state.registros = [];
        dataSaidaEl.value = formatISO(new Date());
        bindEvents();
        recalcAll();
        applyFilters();
        updateDashboard();
        setInterval(() => { createSilentBackup(); }, 300000);
        window.addEventListener('beforeunload', () => { createSilentBackup(); saveState(); });
    }

    function bindEvents() {
        importBtn.addEventListener('click', () => fileImport.click());
        fileImport.addEventListener('change', (e) => ImportManager.handleFile(e));

        exportXlsxBtn.addEventListener('click', exportXLSX);
        exportCsvBtn.addEventListener('click', exportCSV);
        downloadJsonBtn.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gestor_os_export.json'; a.click();
        });
        quantidadeEl.addEventListener('input', recalcAll);
        custoEl.addEventListener('input', recalcAll);
        tipoEl.addEventListener('change', recalcAll);
        dataSaidaEl.addEventListener('change', recalcAll);
        salvarBtn.addEventListener('click', saveRecord);
        limparBtn.addEventListener('click', clearForm);
        carregarBtn.addEventListener('click', loadSelectedToForm);
        duplicarBtn.addEventListener('click', duplicateSelected);
        excluirBtn.addEventListener('click', deleteSelected);
        clearAllBtn.addEventListener('click', () => { if (confirm('Apagar todos os registros?')) { state.registros = []; saveState(); applyFilters(); updateDashboard(); alert('Apagado'); } });
        fecharModalBtn.addEventListener('click', () => modalBackups.style.display = 'none');
        filtroClienteEl.addEventListener('input', applyFilters);
        filtroOSEl.addEventListener('input', applyFilters);
        filtroDataEl.addEventListener('change', applyFilters);
        limparFiltrosBtn.addEventListener('click', () => {
            filtroClienteEl.value = '';
            filtroOSEl.value = '';
            filtroDataEl.value = '';
            applyFilters();
        });
    }

    function calcDevendo(r) {
        let paid = 0;
        if (r.PAGO_SINAL) paid += Number(r.SINAL || 0);
        if (r.PAGO_P1) paid += Number(r.PARCELA_1 || 0);
        if (r.PAGO_P2) paid += Number(r.PARCELA_2 || 0);
        return Number(Math.max(0, r.TOTAL - paid).toFixed(2));
    }

    function recalcAll() {
      const qtd = Math.max(1, Number(quantidadeEl.value) || 1);
      const custo = Number(custoEl.value) || 0;
      const total = Number((qtd * custo).toFixed(2));
      totalEl.value = 'R$ ' + money(total);
      const sinal = Number((total * 0.5).toFixed(2));
      sinalEl.value = 'R$ ' + money(sinal);
      if (tipoEl.value === '15') {
        parcela1El.value = 'R$ ' + money(total * 0.25);
        parcela2El.value = 'R$ ' + money(total * 0.25);
        dataParcela1El.value = addDays(dataSaidaEl.value, 15);
        dataParcela2El.value = addDays(dataSaidaEl.value, 30);
      } else {
        parcela1El.value = 'R$ ' + money(total * 0.5);
        parcela2El.value = 'R$ 0,00';
        dataParcela1El.value = addDays(dataSaidaEl.value, 30);
        dataParcela2El.value = '';
      }
    }

    function saveRecord() {
      const cliente = clienteEl.value.trim();
      const equipamento = equipamentoEl.value.trim();
      const osNum = osEl.value.trim();
      if (!cliente || !equipamento || !osNum) { alert('Preencha Cliente, Equipamento e NÚMERO DA OS (obrigatório).'); return; }
      const tipo = tipoEl.value;
      const dataSaida = dataSaidaEl.value || formatISO(new Date());
      const qtd = Number(quantidadeEl.value) || 1;
      const custo = Number(custoEl.value) || 0;
      const total = Number((qtd * custo).toFixed(2));
      const sinal = Number((total * 0.5).toFixed(2));
      const p1 = Number((tipo === '15' ? total * 0.25 : total * 0.5).toFixed(2));
      const p2 = Number((tipo === '15' ? total * 0.25 : 0).toFixed(2));

      const record = {
        id: editingId ?? ('r' + Date.now()),
        CLIENTE: cliente, TIPO_CLIENTE: tipo === '15' ? '15 dias' : '30 dias', DATA_SAIDA_ISO: dataSaida,
        DATA_PARCELA1_ISO: dataParcela1El.value || '', DATA_PARCELA2_ISO: dataParcela2El.value || '',
        SINAL: sinal, PARCELA_1: p1, PARCELA_2: p2, EQUIPAMENTO: equipamento, OS: osNum, QUANTIDADE: qtd, CUSTO: custo, TOTAL: total,
        PAGO_SINAL: pagamentoRealizadoEl.value === 'sim', PAGO_SINAL_DATA: pagamentoRealizadoEl.value === 'sim' ? formatISO(new Date()) : '',
        PAGO_P1: false, PAGO_P1_DATA: '', PAGO_P2: false, PAGO_P2_DATA: '', DEVENDO: 0
      };
      record.DEVENDO = calcDevendo(record);

      const existingIndex = state.registros.findIndex(r => r.OS === record.OS && r.id !== record.id);
      if (existingIndex >= 0 && !editingId) {
        const replace = confirm(`Já existe uma OS com número "${record.OS}". Deseja substituir?`);
        if (replace) {
          record.id = state.registros[existingIndex].id;
          state.registros[existingIndex] = record;
          editingId = null;
        } else {
          alert('Registro não salvo (OS duplicada ignorada).');
          return;
        }
      } else if (editingId) {
        const idx = state.registros.findIndex(r => r.id === editingId);
        if (idx >= 0) state.registros[idx] = record;
        editingId = null;
      } else {
        state.registros.push(record);
      }

      saveState();
      applyFilters();
      updateDashboard();
      clearForm();
      alert('Registro salvo.');
    }

    function clearForm() {
      clienteEl.value = ''; equipamentoEl.value = ''; osEl.value = ''; tipoEl.value = '15';
      dataSaidaEl.value = formatISO(new Date());
      quantidadeEl.value = 1; custoEl.value = '0.00'; pagamentoRealizadoEl.value = 'nao';
      editingId = null;
      recalcAll();
    }

    function applyFilters() {
        const filtroCliente = filtroClienteEl.value.trim().toLowerCase();
        const filtroOS = filtroOSEl.value.trim().toLowerCase();
        const filtroData = filtroDataEl.value;

        const filteredData = state.registros.filter(r => {
            const matchCliente = !filtroCliente || r.CLIENTE.toLowerCase().includes(filtroCliente);
            const matchOS = !filtroOS || r.OS.toLowerCase().includes(filtroOS);
            const matchData = !filtroData || r.DATA_SAIDA_ISO === filtroData;
            return matchCliente && matchOS && matchData;
        });
        renderTable(filteredData);
    }

    function renderTable(dataToRender) {
      tableBody.innerHTML = '';
      const sourceData = dataToRender === undefined ? state.registros : dataToRender;

      sourceData.forEach(r => {
        const tr = document.createElement('tr'); tr.dataset.id = r.id;
        const allPaid = r.PAGO_SINAL && (r.PARCELA_1 === 0 || r.PAGO_P1) && (r.PARCELA_2 === 0 || r.PAGO_P2);
        if (allPaid) tr.classList.add('status-paid');
        else {
          let overdue = false, near = false;
          if (r.DATA_PARCELA1_ISO && !r.PAGO_P1) { if (daysDiff(r.DATA_PARCELA1_ISO) < 0) overdue = true; else if (daysDiff(r.DATA_PARCELA1_ISO) <= 2) near = true; }
          if (r.DATA_PARCELA2_ISO && !r.PAGO_P2) { if (daysDiff(r.DATA_PARCELA2_ISO) < 0) overdue = true; else if (daysDiff(r.DATA_PARCELA2_ISO) <= 2) near = true; }
          if (overdue) tr.classList.add('status-overdue'); else if (near) tr.classList.add('status-warning');
        }

        const pagos = `${r.PAGO_SINAL ? 'Sinal ' : ''}${r.PAGO_P1 ? 'P1 ' : ''}${r.PAGO_P2 ? 'P2' : ''}` || '-';
        const cols = [
          r.CLIENTE, isoToBR(r.DATA_SAIDA_ISO), r.DATA_PARCELA1_ISO ? isoToBR(r.DATA_PARCELA1_ISO) : '', r.DATA_PARCELA2_ISO ? isoToBR(r.DATA_PARCELA2_ISO) : '',
          'R$ ' + money(r.SINAL || 0), 'R$ ' + money(r.PARCELA_1 || 0), 'R$ ' + money(r.PARCELA_2 || 0),
          r.EQUIPAMENTO, r.OS, r.QUANTIDADE, 'R$ ' + money(r.CUSTO || 0), 'R$ ' + money(r.TOTAL || 0),
          pagos, 'R$ ' + money(r.DEVENDO || 0), r.TIPO_CLIENTE
        ];
        cols.forEach(c => { const td = document.createElement('td'); td.innerText = c ?? ''; tr.appendChild(td); });

        const tdActions = document.createElement('td'); tdActions.style.whiteSpace = 'nowrap';
        const btnS = document.createElement('button'); btnS.className = 'small-btn ghost'; btnS.innerText = r.PAGO_SINAL ? 'Desap. Sinal' : 'Aprov. Sinal';
        btnS.addEventListener('click', (ev) => { ev.stopPropagation(); togglePago(r.id, 'sinal'); });
        tdActions.appendChild(btnS);

        if (r.PARCELA_1 > 0) {
          const btnP1 = document.createElement('button'); btnP1.className = 'small-btn ghost'; btnP1.innerText = r.PAGO_P1 ? 'Desap. P1' : 'Aprov. P1';
          btnP1.addEventListener('click', (ev) => { ev.stopPropagation(); togglePago(r.id, 'p1'); });
          tdActions.appendChild(btnP1);
        }
        if (r.PARCELA_2 > 0) {
          const btnP2 = document.createElement('button'); btnP2.className = 'small-btn ghost'; btnP2.innerText = r.PAGO_P2 ? 'Desap. P2' : 'Aprov. P2';
          btnP2.addEventListener('click', (ev) => { ev.stopPropagation(); togglePago(r.id, 'p2'); });
          tdActions.appendChild(btnP2);
        }

        const btnEdit = document.createElement('button'); btnEdit.className = 'small-btn ghost'; btnEdit.innerText = 'Editar';
        btnEdit.addEventListener('click', (ev) => { ev.stopPropagation(); selectedRowId = r.id; tr.classList.add('selected'); loadSelectedToForm(); });
        tdActions.appendChild(btnEdit);

        const btnDup = document.createElement('button'); btnDup.className = 'small-btn ghost'; btnDup.innerText = 'Duplicar';
        btnDup.addEventListener('click', (ev) => { ev.stopPropagation(); selectedRowId = r.id; duplicateSelected(); });
        tdActions.appendChild(btnDup);

        const btnDel = document.createElement('button'); btnDel.className = 'small-btn red'; btnDel.innerText = 'Excluir';
        btnDel.addEventListener('click', (ev) => { ev.stopPropagation(); if (confirm('Excluir OS ' + r.OS + '?')) { state.registros = state.registros.filter(x => x.id !== r.id); saveState(); applyFilters(); updateDashboard(); } });
        tdActions.appendChild(btnDel);

        tr.appendChild(tdActions);
        tr.addEventListener('click', () => {
          const prev = tableBody.querySelector('tr.selected'); if (prev) prev.classList.remove('selected');
          tr.classList.add('selected');
          selectedRowId = r.id;
        });
        tableBody.appendChild(tr);
      });
    }

    function togglePago(id, tipo) {
      const r = state.registros.find(x => x.id === id);
      if (!r) return;
      if (tipo === 'sinal') { r.PAGO_SINAL = !r.PAGO_SINAL; r.PAGO_SINAL_DATA = r.PAGO_SINAL ? formatISO(new Date()) : ''; }
      if (tipo === 'p1') { r.PAGO_P1 = !r.PAGO_P1; r.PAGO_P1_DATA = r.PAGO_P1 ? formatISO(new Date()) : ''; }
      if (tipo === 'p2') { r.PAGO_P2 = !r.PAGO_P2; r.PAGO_P2_DATA = r.PAGO_P2 ? formatISO(new Date()) : ''; }
      r.DEVENDO = calcDevendo(r);
      saveState(); applyFilters(); updateDashboard();
    }

    function loadSelectedToForm() {
      const sel = state.registros.find(r => r.id === selectedRowId);
      if (!sel) { alert('Selecione uma linha clicando nela.'); return; }
      editingId = sel.id;
      clienteEl.value = sel.CLIENTE; tipoEl.value = sel.TIPO_CLIENTE.includes('15') ? '15' : '30';
      dataSaidaEl.value = sel.DATA_SAIDA_ISO || formatISO(new Date());
      equipamentoEl.value = sel.EQUIPAMENTO; quantidadeEl.value = sel.QUANTIDADE; custoEl.value = sel.CUSTO; osEl.value = sel.OS;
      pagamentoRealizadoEl.value = sel.PAGO_SINAL ? 'sim' : 'nao';
      dataParcela1El.value = sel.DATA_PARCELA1_ISO || ''; dataParcela2El.value = sel.DATA_PARCELA2_ISO || '';
      recalcAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function duplicateSelected() {
      const sel = state.registros.find(r => r.id === selectedRowId);
      if (!sel) { alert('Selecione uma linha para duplicar.'); return; }
      editingId = null;
      clienteEl.value = sel.CLIENTE; tipoEl.value = sel.TIPO_CLIENTE.includes('15') ? '15' : '30';
      dataSaidaEl.value = sel.DATA_SAIDA_ISO || formatISO(new Date());
      equipamentoEl.value = sel.EQUIPAMENTO; quantidadeEl.value = sel.QUANTIDADE; custoEl.value = sel.CUSTO;
      osEl.value = ''; pagamentoRealizadoEl.value = 'nao';
      recalcAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteSelected() {
      const sel = state.registros.find(r => r.id === selectedRowId);
      if (!sel) { alert('Selecione uma linha para excluir.'); return; }
      if (confirm('Excluir OS ' + sel.OS + '?')) { state.registros = state.registros.filter(r => r.id !== sel.id); saveState(); applyFilters(); updateDashboard(); }
    }

    function updateDashboard() {
      const totalFaturado = state.registros.reduce((s, r) => s + (Number(r.TOTAL) || 0), 0);
      const totalRecebido = state.registros.reduce((s, r) => {
        let paid = 0; if (r.PAGO_SINAL) paid += Number(r.SINAL || 0); if (r.PAGO_P1) paid += Number(r.PARCELA_1 || 0); if (r.PAGO_P2) paid += Number(r.PARCELA_2 || 0); return s + paid;
      }, 0);
      const totalDevendo = state.registros.reduce((s, r) => s + (Number(r.DEVENDO) || 0), 0);
      const ativas = state.registros.length;

      dashTotal.innerText = 'R$ ' + money(totalFaturado);
      dashRecebido.innerText = 'R$ ' + money(totalRecebido);
      dashDevendo.innerText = 'R$ ' + money(totalDevendo);
      dashAtivas.innerText = String(ativas);

      drawSimpleBar(chartFaturado, totalFaturado, '#0f62fe');
      drawSimpleBar(chartRec, totalRecebido, '#10b981');
      drawSimpleBar(chartDev, totalDevendo, '#f59e0b');
    }

    function drawSimpleBar(canvas, value, color) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width = canvas.clientWidth * devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(w * 0.08, h * 0.3, w * 0.84, h * 0.4);
      const max = Math.max(1, state.registros.reduce((s, r) => s + (Number(r.TOTAL) || 0), 0));
      const ratio = Math.min(1, value / max || 0);
      ctx.fillStyle = color;
      ctx.fillRect(w * 0.08, h * 0.3, w * 0.84 * ratio, h * 0.4);
      ctx.fillStyle = '#0f1724';
      ctx.font = `${12 * devicePixelRatio}px Arial`;
      ctx.fillText('R$ ' + money(value), w * 0.08, h * 0.22);
    }

    function exportXLSX() {
      if (!state.registros.length) { alert('Sem registros.'); return; }
      const rows = state.registros.map(r => ({
        CLIENTE: r.CLIENTE, TIPO_CLIENTE: r.TIPO_CLIENTE, DATA_SAIDA: isoToBR(r.DATA_SAIDA_ISO),
        DATA_PARCELA1: r.DATA_PARCELA1_ISO ? isoToBR(r.DATA_PARCELA1_ISO) : '',
        DATA_PARCELA2: r.DATA_PARCELA2_ISO ? isoToBR(r.DATA_PARCELA2_ISO) : '',
        SINAL: r.SINAL, PARCELA_1: r.PARCELA_1, PARCELA_2: r.PARCELA_2,
        EQUIPAMENTO: r.EQUIPAMENTO, OS: r.OS, QUANTIDADE: r.QUANTIDADE, CUSTO: r.CUSTO, TOTAL: r.TOTAL,
        PAGAMENTO_REALIZADO: (r.PAGO_SINAL ? 'Sinal ' : '') + (r.PAGO_P1 ? 'P1 ' : '') + (r.PAGO_P2 ? 'P2' : ''),
        DEVENDO: r.DEVENDO
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'OS');
      const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const blob = new Blob([wbout], {type:'application/octet-stream'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `os_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
    }

    function exportCSV() {
      if (!state.registros.length) { alert('Sem registros.'); return; }
      const rows = state.registros.map(r => [
        '"' + (r.CLIENTE||'').replace(/"/g,'""') + '"',
        '"' + (r.TIPO_CLIENTE||'') + '"',
        '"' + (r.DATA_SAIDA_ISO ? isoToBR(r.DATA_SAIDA_ISO) : '') + '"',
        '"' + (r.DATA_PARCELA1_ISO ? isoToBR(r.DATA_PARCELA1_ISO) : '') + '"',
        '"' + (r.DATA_PARCELA2_ISO ? isoToBR(r.DATA_PARCELA2_ISO) : '') + '"',
        (r.SINAL||0).toFixed(2),
        (r.PARCELA_1||0).toFixed(2),
        (r.PARCELA_2||0).toFixed(2),
        '"' + (r.EQUIPAMENTO||'').replace(/"/g,'""') + '"',
        '"' + (r.OS||'') + '"',
        r.QUANTIDADE,
        (r.CUSTO||0).toFixed(2),
        (r.TOTAL||0).toFixed(2),
        '"' + ((r.PAGO_SINAL? 'Sinal ' : '') + (r.PAGO_P1? 'P1 ' : '') + (r.PAGO_P2? 'P2' : '')) + '"',
        (r.DEVENDO||0).toFixed(2)
      ]);
      const header = ['CLIENTE','TIPO_CLIENTE','DATA_SAIDA','DATA_PARCELA1','DATA_PARCELA2','SINAL','PARCELA_1','PARCELA_2','EQUIPAMENTO','OS','QUANTIDADE','CUSTO','TOTAL','PAGOS','DEVENDO'];
      const csv = [header.join(';')].concat(rows.map(r=> r.join(';'))).join('\r\n');
      const blob = new Blob([`\uFEFF${csv}`], {type:'text/csv;charset=utf-8;'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `os_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; a.click(); URL.revokeObjectURL(a.href);
    }

    function getBackups() { try { const raw = localStorage.getItem(LS_BACKUPS); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
    function saveBackups(list) { localStorage.setItem(LS_BACKUPS, JSON.stringify(list)); }

    function createSilentBackup() {
      const backups = getBackups();
      const snapshot = JSON.stringify(state);
      if (backups.length > 0 && backups[0].data === snapshot) {
        return;
      }
      const record = { timestamp: Date.now(), data: snapshot };
      backups.unshift(record);
      if (backups.length > 20) backups.splice(20);
      saveBackups(backups);
    }

    function openBackups() {
      const backups = getBackups();
      backupsList.innerHTML = '';
      if (!backups.length) { backupsList.innerHTML = '<div class="muted">Nenhum backup disponível.</div>'; return; }
      backups.forEach((b) => {
        const div = document.createElement('div'); div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center'; div.style.padding='8px'; div.style.borderBottom='1px solid #eef2f7';
        const left = document.createElement('div'); 
        const date = new Date(b.timestamp);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        left.innerHTML = `<strong>${formattedDate}</strong><div class="muted" style="font-size:12px">Registros: ${JSON.parse(b.data).registros.length}</div>`;
        
        const right = document.createElement('div');
        const btnDL = document.createElement('button'); btnDL.className='ghost small-btn'; btnDL.innerText='Download';
        btnDL.addEventListener('click', ()=> { const blob = new Blob([b.data], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`backup_${new Date(b.timestamp).toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`; a.click(); URL.revokeObjectURL(a.href); });
        
        const btnRestore = document.createElement('button'); btnRestore.className='red small-btn'; btnRestore.innerText='Restaurar';
        btnRestore.addEventListener('click', ()=> { if(confirm('Restaurar backup de '+ formattedDate + '? A ação não pode ser desfeita.')){ state = JSON.parse(b.data); saveState(); applyFilters(); updateDashboard(); modalBackups.style.display='none'; alert('Backup restaurado com sucesso.'); }});
        
        right.appendChild(btnDL); right.appendChild(btnRestore);
        div.appendChild(left); div.appendChild(right);
        backupsList.appendChild(div);
      });
      modalBackups.style.display = 'flex';
    }

    // Expor função para o escopo global (se necessário, como para um botão no HTML)
    window.openBackups = openBackups;

    // Iniciar a aplicação
    init();
});

