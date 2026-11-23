-- Data uji: 2 admin, 4 peserta di dua holding, 3 board.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001','dhaka@x'),('00000000-0000-0000-0000-000000000002','ayu@x'),
 ('00000000-0000-0000-0000-000000000003','intan@x'),('00000000-0000-0000-0000-000000000004','dimas@x'),
 ('00000000-0000-0000-0000-000000000005','fajar@x'),('00000000-0000-0000-0000-000000000006','rudi@x'),
 ('00000000-0000-0000-0000-000000000007','dua@x');
insert into profiles (id, employee_no, full_name, login_id, role) values
 ('00000000-0000-0000-0000-000000000001','PPL-0001','Dhaka','dhaka@x','superadmin'),
 ('00000000-0000-0000-0000-000000000002','PPL-0002','Ayu','ayu@x','admin'),
 ('00000000-0000-0000-0000-000000000003','PPL-0003','Intan','intan@x','admin'),
 ('00000000-0000-0000-0000-000000000004','SIB-0142','Dimas','dimas@x','peserta'),
 ('00000000-0000-0000-0000-000000000005','BJO-0087','Fajar','fajar@x','peserta'),
 ('00000000-0000-0000-0000-000000000006','SIB-0031','Rudi','rudi@x','peserta'),
 ('00000000-0000-0000-0000-000000000007','SIB-0500','Dua Holding','dua@x','peserta');
insert into memberships (profile_id, holding_id, manager_id) values
 ('00000000-0000-0000-0000-000000000001','people',null),
 ('00000000-0000-0000-0000-000000000002','people',null),
 ('00000000-0000-0000-0000-000000000003','people',null),
 ('00000000-0000-0000-0000-000000000004','sib','00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-000000000005','bejo',null),
 ('00000000-0000-0000-0000-000000000006','sib',null),
 ('00000000-0000-0000-0000-000000000007','sib',null),
 ('00000000-0000-0000-0000-000000000007','bejo',null);
-- Ayu: SIB penuh. Intan: BEJO penuh. Ayu tidak punya akses BEJO.
insert into admin_access (profile_id, holding_id, module) values
 ('00000000-0000-0000-0000-000000000002','sib','sop'),('00000000-0000-0000-0000-000000000002','sib','pengguna'),
 ('00000000-0000-0000-0000-000000000002','sib','analitik'),
 ('00000000-0000-0000-0000-000000000003','bejo','sop'),('00000000-0000-0000-0000-000000000003','bejo','pengguna');
-- Board A (SIB), B (BEJO), C (SIB+BEJO), semuanya satu library, satu playbook, satu card terbit
insert into boards (id, name, created_by) values
 ('a0000000-0000-0000-0000-00000000000a','Board A','00000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-00000000000b','Board B','00000000-0000-0000-0000-000000000001'),
 ('c0000000-0000-0000-0000-00000000000c','Board C','00000000-0000-0000-0000-000000000001');
insert into board_holdings values
 ('a0000000-0000-0000-0000-00000000000a','sib'),('b0000000-0000-0000-0000-00000000000b','bejo'),
 ('c0000000-0000-0000-0000-00000000000c','sib'),('c0000000-0000-0000-0000-00000000000c','bejo');
insert into libraries (id, board_id, name) select gen_random_uuid(), id, 'Lib '||name from boards;
insert into playbooks (id, library_id, name) select gen_random_uuid(), id, 'PB '||name from libraries;
insert into cards (id, playbook_id, title, created_by) select gen_random_uuid(), id, 'Card '||name, '00000000-0000-0000-0000-000000000001' from playbooks;
-- terbitkan semua card sebagai superadmin
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select publish_card(id) from cards;
reset role;
-- satu card draf di Board A
insert into cards (playbook_id, title, created_by) select p.id, 'Draf A', '00000000-0000-0000-0000-000000000001'
 from playbooks p join libraries l on l.id=p.library_id where l.board_id='a0000000-0000-0000-0000-00000000000a';
