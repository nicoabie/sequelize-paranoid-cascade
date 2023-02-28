#!/usr/bin/env node

import * as readline from 'node:readline';
import { Sequelize } from 'sequelize-typescript';
import { QueryInterface, QueryTypes } from 'sequelize';
import { ForeignKeyFields } from './types';
import { buildCreateTriggerStatement } from './commands/helpers/buildCreateTriggerStatement';
import { buildTriggerName } from './commands/helpers/buildTriggerName';
import { getSoftDeleteTableNames } from './utils/getSoftDeleteTableNames';
import { getForeignKeysTableRelations } from './utils/getForeignKeysTableRelations';


const dedupe = <T>(array: readonly T[], hasher: (e: T) => string): T[] => {
  const uniques: { [hash: string]: T } = {};

  array.forEach((item) => (uniques[hasher(item)] = item));

  return Object.values(uniques);
};

const askForNextRelation = (rl: readline.Interface, relation: ForeignKeyFields) => {
  rl.setPrompt(`Do you want to mark ${relation.tableName} as deleted when ${relation.referencedTableName} is deleted? (y/n) `);
  rl.prompt();
}

type ArgvType = {dbname: string, schema: string; username: string, password: string, host: string, port: number, dialect: 'mysql'};

const up = async (argv: ArgvType) => {
  const {dbname, schema, username, password, host, port, dialect} = argv;
  const sequelize = new Sequelize(dbname, username, password, {
    dialect,
    host,
    port,
    schema,
    logging: false,
  });
  const queryInterface: QueryInterface = sequelize.getQueryInterface();

  const softDeleteTableNames = await getSoftDeleteTableNames(schema, queryInterface);

  const foreignKeysTableRelations = (
    await getForeignKeysTableRelations(softDeleteTableNames, schema, queryInterface)
  )
  .filter(({ tableName, referencedTableName, referencedColumnName }) =>
    referencedColumnName !== 'centralizedCompanyId'
  );

  const uniqueForeignKeys = dedupe(foreignKeysTableRelations, ({ referencedTableName, tableName }) =>
    buildTriggerName(referencedTableName, tableName),
  );

  console.log(uniqueForeignKeys.pop());
  console.log(uniqueForeignKeys.pop());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Database will be scanned for tables with deletedAt column. Do you want to continue? (y/n) ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    switch (line.trim()) {
      case 'y':
        if (uniqueForeignKeys.length) {
          askForNextRelation(rl, uniqueForeignKeys.pop() as ForeignKeyFields);
        } else {
          console.log('Finished');
        }
        break;
      case 'n':
        rl.close();
        break;
      default:
        console.log(`Say what? I might have heard '${line.trim()}'`);
        break;
    }
  }).on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
  });

  // await Promise.all(
  //   uniqueForeignKeys
  //     .filter(({ referencedTableName }) =>
  //       tables.find((t) => t.primaryTableName === referencedTableName),
  //     )
  //     .map(({ tableName, columnName, referencedTableName, referencedColumnName }) =>
  //       sequelize.query(
  //         buildCreateTriggerStatement(
  //           referencedTableName,
  //           referencedColumnName,
  //           tableName,
  //           columnName,
  //         ),
  //       ).then(() => console.log(`Created trigger for ${tableName}.${columnName} and ${referencedTableName}.${referencedColumnName}`)),
  //     ),
  // );
};

(async () => {
  const [dbname, schema, username, password, host, port, dialect] = process.argv.slice(2);
  await up({dbname: dbname ?? 'default', schema: schema ?? 'default', username: username ?? 'root', password: password ?? 'root', host: host ?? '127.0.0.1', port: Number(port ?? '3306'), dialect: dialect as 'mysql' ?? 'mysql'});
})();