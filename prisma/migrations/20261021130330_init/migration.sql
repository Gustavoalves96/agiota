-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(60) NOT NULL,
    `apelido` VARCHAR(30) NULL,
    `telefone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `endereco` VARCHAR(120) NULL,
    `saldoDevedor` DECIMAL(10, 2) NOT NULL DEFAULT 0,

    UNIQUE INDEX `clientes_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cobradores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(60) NOT NULL,
    `telefone` VARCHAR(20) NOT NULL,
    `comissao` DECIMAL(5, 2) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emprestimos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `cobradorId` INTEGER NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `juros` DECIMAL(5, 2) NOT NULL DEFAULT 20,
    `jurosAtraso` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `valorTotal` DECIMAL(10, 2) NOT NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `vencimento` DATETIME(3) NOT NULL,
    `status` ENUM('ABERTO', 'ATRASADO', 'QUITADO') NOT NULL DEFAULT 'ABERTO',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagamentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emprestimoId` INTEGER NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `forma` ENUM('PIX', 'DINHEIRO') NOT NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `emprestimos` ADD CONSTRAINT `emprestimos_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emprestimos` ADD CONSTRAINT `emprestimos_cobradorId_fkey` FOREIGN KEY (`cobradorId`) REFERENCES `cobradores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagamentos` ADD CONSTRAINT `pagamentos_emprestimoId_fkey` FOREIGN KEY (`emprestimoId`) REFERENCES `emprestimos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
