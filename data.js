// Configuração das Etapas e Mock Initial State para o Checklist Marvel de Devoluções

const INITIAL_STAGES = [
  {
    id: 1,
    code: "01",
    title: "Recebimento",
    subtitle: "Identificação inicial da ocorrência, condutor e frota.",
    tasks: [
      { id: "t1_1", text: "Atender o chamado no OPA!", required: true },
      { id: "t1_2", text: "Identificar a frota", required: true },
      { id: "t1_3", text: "Preencher etiqueta da frota no OPA!", required: true },
      { id: "t1_4", text: "Motivo da devolução", required: true }
    ]
  },
  {
    id: 2,
    code: "02",
    title: "Documentação",
    subtitle: "Conferência das notas fiscais e documentos de devolução.",
    isDocChoiceStage: true,
    options: [
      {
        id: "parcial",
        title: "Parcial",
        description: "Devolução parcial de mercadoria. Exige conferência de NFDs.",
        tasks: [
          { id: "t2_p1", text: "Solicitar fotos das NFDs ao condutor", required: true },
          { id: "t2_p2", text: "Verificar se a quantidade de NFDs encaminhadas está correta, perguntando: 'Tem mais alguma nota de devolução, ou somente essa?'", required: true },
          { id: "t2_p3", text: "Confirmar a quantidade de notas encaminhadas", required: true },
          { id: "t2_p4", text: "Baixar as NFDs em PDF pelo Meu Danfe", required: true },
          { id: "t2_p5", text: "Encaminhar as NFDs em PDF no chamado do OPA!", required: true },
          { id: "t2_p6", text: "Documentação e quantidade confirmada", required: true }
        ]
      },
      {
        id: "total",
        title: "Total",
        description: "Devolução total de mercadoria. Exige conferência de notas recusadas.",
        tasks: [
          { id: "t2_t1", text: "Solicitar fotos das notas recusadas ao condutor", required: true },
          { id: "t2_t2", text: "Confirmar que todas as notas estão recusadas, carimbadas, assinadas e devidamente ressalvadas", required: true },
          { id: "t2_t3", text: "Verificar se a quantidade de notas encaminhadas está correta, perguntando: 'Tem mais alguma nota recusada, ou somente essa?'", required: true },
          { id: "t2_t4", text: "Confirmar a quantidade de notas encaminhadas", required: true },
          { id: "t2_t5", text: "Baixar as notas em PDF pelo Meu Danfe", required: true },
          { id: "t2_t6", text: "Encaminhar as notas em PDF no chamado do OPA!", required: true },
          { id: "t2_t7", text: "Registrar insucesso na entrega, caso a mercadoria retorne para a origem", required: true },
          { id: "t2_t8", text: "Documentação e quantidade confirmada", required: true }
        ]
      }
    ]
  },
  {
    id: 3,
    code: "03",
    title: "Registros de Imagens",
    subtitle: "Registro fotográfico e vistoria dos produtos.",
    hasProductPhotosUpload: true,
    tasks: [
      {
        id: "t3_1",
        text: "Solicitar fotos dos produtos",
        required: true,
        orientation: [
          "Todos os itens devem ser fotografados;",
          "Fotografar todos os lados das caixas;",
          "Caso a caixa esteja aberta, fotografar também o interior."
        ],
        hasUpload: true
      },
      { id: "t3_2", text: "Confirmar se os produtos estão conforme as NFs", required: true },
      { id: "t3_3", text: "Todas as fotos estão no OPA!", required: true }
    ]
  },
  {
    id: 4,
    code: "04",
    title: "Direcionamento da Devolução",
    subtitle: "Seleção do tipo de direcionamento e cuidados com a carga.",
    isDirectionChoiceStage: true,
    options: [
      {
        id: "a_definir_fornecedor",
        title: "A definir com o fornecedor",
        description: "Mercadorias que não cabem na cabine ou possuem valor expressivamente alto.",
        tasks: [
          { id: "t4_opt1_1", text: "Cliente/fornecedor comunicado", required: true },
          { id: "t4_opt1_2", text: "Notas encaminhadas para o fornecedor", required: true },
          { id: "t4_opt1_3", text: "Motivo informado", required: true },
          { id: "t4_opt1_4", text: "Quantidade informada", required: true },
          { id: "t4_opt1_5", text: "Solicitação de direcionamento enviada", required: true },
          { id: "t4_opt1_6", text: "Cliente direcionou o veículo", required: true }
        ],
        subsection: {
          title: "ETAPA 04.02 — CUIDADO COM A CARGA E LOCALIZAÇÃO",
          tasks: [
            { id: "t4_sub_1", text: "Solicitar foto do carregamento dos produtos devolvidos", required: true },
            { id: "t4_sub_2", text: "Paletes conferidos", required: true },
            { id: "t4_sub_3", text: "Altura dos paletes", required: true },
            { id: "t4_sub_4", text: "Risco de tombamento verificado", required: true },
            { id: "t4_sub_5", text: "Carga reorganizada, se necessário", required: true },
            { id: "t4_sub_6", text: "Foto final realizada", required: true },
            { id: "t4_sub_7", text: "Localização conferida conforme a nota", required: true },
            { id: "t4_sub_8", text: "Emitir CT-e, se necessário", required: true },
            { id: "t4_sub_9", text: "Após validação, encaminhar a localização ao condutor pelo OPA!", required: true },
            { id: "t4_sub_10", text: "Acompanhar o descarregamento", required: true },
            { id: "t4_sub_11", text: "Coletar todos os canhotos assinados", required: true },
            { id: "t4_sub_12", text: "Encaminhar os comprovantes ao cliente", required: true }
          ]
        }
      },
      {
        id: "alocar_cabine",
        title: "Alocar em cabine",
        description: "Pequena quantidade de produtos devolvidos, que pode ser acomodada na cabine para posterior entrega em uma filial próxima.",
        tasks: [
          { id: "t4_opt2_1", text: "Orientar o condutor a alocar os produtos na cabine", required: true },
          { id: "t4_opt2_2", text: "Confirmar que os produtos foram alocados nas cabines", required: true },
          { id: "t4_opt2_3", text: "Tirar foto de como ficaram os produtos na cabine", required: true, hasUpload: true },
          { id: "t4_opt2_4", text: "Cliente/fornecedor comunicado", required: true },
          { id: "t4_opt2_5", text: "Notas encaminhadas para o fornecedor", required: true },
          { id: "t4_opt2_6", text: "Motivo informado", required: true },
          { id: "t4_opt2_7", text: "Quantidade informada", required: true },
          { id: "t4_opt2_8", text: "Solicitação de direcionamento enviada", required: true },
          { id: "t4_opt2_9", text: "Cliente direcionou o veículo", required: true },
          { id: "t4_opt2_10", text: "Preencher a planilha de cabine", required: true },
          { id: "t4_opt2_11", text: "Acionar outros veículos caso seja identificada grande quantidade de mercadoria", required: true },
          { id: "t4_opt2_12", text: "Aguardar o descarregamento nas filiais para posterior direcionamento dos produtos", required: true }
        ]
      }
    ]
  },
  {
    id: 5,
    code: "05",
    title: "Conferência e Lançamentos",
    subtitle: "Checklist final de encerramento e lançamento nos sistemas corporativos.",
    tasksGeneral: [
      { id: "t5_gen_1", text: "Veículo vazio", required: true },
      { id: "t5_gen_2", text: "Comprovantes em mãos", required: true },
      { id: "t5_gen_3", text: "Comprovantes encaminhados para o cliente", required: true },
      { id: "t5_gen_4", text: "Nota lançada no Rodopar", required: true },
      { id: "t5_gen_5", text: "Feedback lançado para o condutor no Ecotracking", required: true },
      { id: "t5_gen_6", text: "Finalizado", required: true }
    ],
    tasksCabine: [
      { id: "t5_cab_1", text: "Mercadoria alocada", required: true },
      { id: "t5_cab_2", text: "Planilha de cabine preenchida", required: true },
      { id: "t5_cab_3", text: "NFD lançada no Rodopar", required: true },
      { id: "t5_cab_4", text: "Feedback lançado para o condutor no Ecotracking", required: true },
      { id: "t5_cab_5", text: "Finalizado", required: true }
    ]
  }
];

const MOCK_OPERATORS = [
  "João",
  "Alexandre",
  "Nathali",
  "Yuri",
  "Eduardo"
];

const INITIAL_ATENDIMENTOS = [];

window.MarvelData = {
  INITIAL_STAGES,
  MOCK_OPERATORS,
  INITIAL_ATENDIMENTOS
};
