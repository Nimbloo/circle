import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
   baseDirectory: __dirname,
});

const eslintConfig = [
   ...compat.extends('next/core-web-vitals', 'next/typescript'),
   {
      /**
       * Usar uma `const` antes da declaração dentro de um seletor do zustand não é
       * erro de tipo — o TS assume execução diferida — mas o zustand roda o seletor de
       * forma SÍNCRONA no render, então vira ReferenceError com build verde. Aconteceu
       * na página de Cycles. `variables: true` é o que pega esse caso; funções seguem
       * liberadas (hoisting real) para não obrigar a reordenar helpers.
       */
      files: ['**/*.{ts,tsx}'],
      rules: {
         'no-use-before-define': 'off',
         '@typescript-eslint/no-use-before-define': [
            'error',
            { functions: false, classes: false, variables: true, typedefs: false, enums: false },
         ],
      },
   },
   {
      /**
       * #54 / R6: componente não importa VALOR de `lib/api/*` (código de servidor). O caso
       * real: `ApiError` do servidor no cliente — o `instanceof` nunca casava com o erro que
       * `lib/client.ts` lança, e o convite escondia a mensagem do 409. Tipos seguem livres;
       * `webhook-events` é um módulo puro feito para o cliente.
       */
      files: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
      rules: {
         '@typescript-eslint/no-restricted-imports': [
            'error',
            {
               patterns: [
                  {
                     group: ['@/lib/api/*', '!@/lib/api/webhook-events'],
                     allowTypeImports: true,
                     message:
                        'Componente não importa valor de lib/api (servidor). Use lib/client (ex.: ApiError) ou import type.',
                  },
               ],
            },
         ],
      },
   },
   {
      // Vendored bazza/ui data-table-filter (kept close to upstream for easy updates)
      // Vendored: data-table-filter (bazza/ui) e os primitivos shadcn de components/ui.
      files: ['components/data-table-filter/**/*.{ts,tsx}', 'components/ui/**/*.{ts,tsx}'],
      rules: {
         '@typescript-eslint/no-use-before-define': 'off',
         '@typescript-eslint/no-unused-vars': 'off',
         '@typescript-eslint/no-explicit-any': 'off',
         '@typescript-eslint/no-this-alias': 'off',
         'react-hooks/rules-of-hooks': 'off',
         'react-hooks/exhaustive-deps': 'off',
      },
   },
];

export default eslintConfig;
