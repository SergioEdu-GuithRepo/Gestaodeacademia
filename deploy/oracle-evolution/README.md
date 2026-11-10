# Evolution API v2 na Oracle Cloud Always Free (100% Gratuito)

Guia rápido para alojar a **Evolution API v2** (WhatsApp) na **Oracle Cloud Infrastructure (OCI) — Always Free** sem custos mensais, compatível com **ARM64 Ampere (`VM.Standard.A1.Flex`)** e **AMD64**.

---

## Passo 1 — Criar a Conta e a Máquina Virtual (Always Free)

1. Aceda a [cloud.oracle.com/free](https://www.oracle.com/cloud/free/) e crie uma conta **Always Free**.
   > **Nota:** A Oracle pede um cartão bancário apenas para verificação antifraude (faz uma pré-autorização temporária de ~1 USD/EUR que é devolvida de imediato). Enquanto mantiver a conta em *Free Tier* (sem carregar em *Upgrade to Pay As You Go*), **nunca há qualquer cobrança**.
2. No painel da Oracle Cloud, vá a **Compute → Instances → Create instance**:
   - **Name:** `evolution-whatsapp`
   - **Image and shape:**
     - **Image:** `Canonical Ubuntu 24.04` (ou `22.04`)
     - **Shape:** Clique em *Change shape* → **Ampere (ARM)** → `VM.Standard.A1.Flex` → escolha **2 OCPUs e 12 GB de RAM** *(o escalão gratuito oferece até 4 OCPUs e 24 GB RAM sem qualquer custo!)*.
   - **Networking:** Deixe criar VCN pública nova com **Assign a public IPv4 address**.
   - **Add SSH keys:** Clique em **Download private key** (guarde o ficheiro `.key` no seu Mac).
   - Clique em **Create** e aguarde ~1 minuto até ficar **RUNNING**. Copie o **Public IP address**.

---

## Passo 2 — Abrir as Portas no Painel da Oracle Cloud (Obrigatório)

Por omissão, a Oracle bloqueia tudo exceto SSH (`22`). Abra as portas web:

1. Na página da instância criada, clique no nome da **Subnet** (secção *Primary VNIC*).
2. Clique em **Default Security List for ...**.
3. Clique em **Add Ingress Rules** e preencha:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Destination Port Range:** `80,443,8080`
   - **Description:** `Evolution API HTTPS e HTTP`
4. Clique em **Add Ingress Rules**.

---

## Passo 3 — Instalar Tudo com 1 Único Comando via SSH

No Terminal do seu Mac, dê permissão à chave SSH transferida e entre na máquina:

```bash
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@SEU_IP_PUBLICO
```

Dentro da máquina Oracle Ubuntu, cole **este único comando**:

```bash
curl -fsSL https://raw.githubusercontent.com/SergioEdu-GuithRepo/Gestaodeacademia/main/deploy/oracle-evolution/instalar-oracle.sh | sudo bash
```

O script faz tudo sozinho em ~2 minutos:
- Instala Docker + Docker Compose;
- Abre o `iptables` interno do Ubuntu da Oracle nas portas `80`, `443` e `8080`;
- Sobe `evoapicloud/evolution-api:v2.3.7` (nativo ARM64/AMD64) + PostgreSQL 16 + Redis 7;
- Configura **HTTPS gratuito automático** (Let's Encrypt via Caddy + `sslip.io`, sem precisar de comprar domínio!);
- Mostra no ecrã a **URL HTTPS** e a **`EVOLUTION_API_KEY`** gerada.

---

## Passo 4 — Ligar na Plataforma Gestão de Academia

1. Entre na sua plataforma na Vercel e vá a **Configurações (`/configuracoes`) → aba WhatsApp**.
2. Preencha:
   - **Modo de funcionamento:** `Produção (Evolution API)`
   - **URL da Evolution API:** `https://SEU-IP-COM-TRACOS.sslip.io` *(mostrada no final do script)*
   - **Chave da API (`EVOLUTION_API_KEY`):** `evo_...` *(mostrada no final do script)*
   - **Nome da instância:** `academia-principal`
3. Clique em **Guardar configurações**.
4. Logo abaixo, clique em **Gerar QR Code / Emparelhar WhatsApp** e leia o QR Code com o telemóvel do centro (**WhatsApp → Dispositivos associados → Associar um dispositivo**).

> **Dica Vercel (Opcional):** Se também quiser definir a mesma instância como padrão global na Vercel (em *Settings → Environment Variables*), adicione `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` e faça *Redeploy*. Se já preencher no ecrã `/configuracoes` de cada centro, nem precisa de mexer na Vercel!
