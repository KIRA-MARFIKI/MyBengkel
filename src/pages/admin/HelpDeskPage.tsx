import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import type { TicketPriority, TicketStatus } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { StatusChip } from '../../components/admin/StatusChip';
import { ActionButton } from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { FormField } from '../../components/admin/FormField';
import { ListSwap, setLastTriggerElement } from '../../components/admin/island/IslandSystem';

const HelpDeskPage: React.FC = () => {
  const { tickets, replyTicket, updateTicketStatus, addTicket } = useAdmin();
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [selectedId, setSelectedId] = useState<string>(tickets[0]?.id || '');
  const [replyText, setReplyText] = useState<string>('');
  const [newOpen, setNewOpen] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'Akun' | 'Bug' | 'Perangkat' | 'Lainnya'>('Perangkat');
  const [newPriority, setNewPriority] = useState<TicketPriority>('Sedang');
  const [newMsg, setNewMsg] = useState('');

  const filtered =
    statusFilter === 'Semua' ? tickets : tickets.filter((t) => t.status === statusFilter);

  const current = tickets.find((t) => t.id === selectedId) || filtered[0] || tickets[0];

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !replyText.trim()) return;
    replyTicket(current.id, replyText.trim(), 'Admin');
    setReplyText('');
  };

  const handleCreateTicket = () => {
    if (!newTitle.trim() || !newMsg.trim()) return;
    const created = addTicket(
      {
        title: newTitle.trim(),
        category: newCategory,
        priority: newPriority,
        status: 'Terbuka',
        reportedBy: 'Admin Counter',
      },
      newMsg.trim()
    );
    setSelectedId(created.id);
    setNewTitle('');
    setNewMsg('');
    setNewOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <DataCard
            title="Antrean Tiket"
            actions={
              <ActionButton
                intent="start"
                onClick={(e) => {
                  setLastTriggerElement(e.currentTarget);
                  setNewOpen(true);
                }}
              >
                Buat tiket
              </ActionButton>
            }
          >
            <div className="mb-4">
              <FilterTabs
                ariaLabel="Filter status tiket"
                value={statusFilter}
                onChange={setStatusFilter}
                tabs={[
                  { value: 'Semua', label: 'Semua', count: tickets.length },
                  { value: 'Terbuka', label: 'Terbuka', count: tickets.filter((t) => t.status === 'Terbuka').length },
                  { value: 'Diproses', label: 'Diproses', count: tickets.filter((t) => t.status === 'Diproses').length },
                  { value: 'Selesai', label: 'Selesai', count: tickets.filter((t) => t.status === 'Selesai').length },
                ]}
              />
            </div>

            <ListSwap swapKey={statusFilter}>
              {filtered.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA]">
                  <p className="text-[14px] text-[#646B7C]">Belum ada tiket bantuan.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[#EEF0F4] rounded-[14px] border border-[#EEF0F4] overflow-hidden">
                  {filtered.map((t) => {
                    const active = current?.id === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          className={`w-full text-left p-3.5 transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                            active ? 'bg-[#1E2230] text-white' : 'bg-white text-[#1E2230] hover:bg-[#F6F7FA]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold truncate">{t.title}</div>
                            <div className={`admin-micro mt-1 ${active ? 'text-white/80' : 'text-[#646B7C]'}`}>
                              {t.id} : {t.category} : {t.reportedBy}
                            </div>
                          </div>
                          <StatusChip status={t.status} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ListSwap>
          </DataCard>
        </div>

        <div className="lg:col-span-7">
          {current ? (
            <DataCard
              title={`${current.id}: ${current.title}`}
              actions={
                <div className="flex items-center gap-2">
                  <StatusChip status={`Prioritas ${current.priority}`} needsAction={current.priority === 'Tinggi'} />
                  {current.status === 'Terbuka' && (
                    <ActionButton intent="wait" onClick={() => updateTicketStatus(current.id, 'Diproses')}>
                      Tandai diproses
                    </ActionButton>
                  )}
                  <select
                    aria-label="Ubah status tiket"
                    value={current.status}
                    onChange={(e) => updateTicketStatus(current.id, e.target.value as TicketStatus)}
                    className="admin-input w-auto"
                  >
                    <option value="Terbuka">Terbuka</option>
                    <option value="Diproses">Diproses</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="text-[14px] text-[#646B7C]">
                  Dilaporkan oleh <strong className="text-[#1E2230]">{current.reportedBy}</strong> pada {current.createdAt}
                </div>

                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {current.thread.map((msg) => (
                    <div key={msg.id} className="p-3.5 rounded-[14px] border border-[#EEF0F4] bg-[#F6F7FA]/70">
                      <div className="flex items-center justify-between admin-micro text-[#646B7C] mb-1.5">
                        <span className="text-[#1E2230] font-semibold">{msg.sender}</span>
                        <span>{msg.time}</span>
                      </div>
                      <p className="text-[14px] text-[#1E2230]">{msg.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleReply} className="pt-4 border-t border-[#EEF0F4] space-y-3">
                  <FormField id="hd-reply" label="Balasan">
                    <textarea
                      id="hd-reply"
                      rows={3}
                      placeholder="Tulis tindak lanjut atau solusi"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="admin-input"
                    />
                  </FormField>
                  <div className="flex justify-end">
                    <ActionButton type="submit" intent="start">
                      Kirim balasan
                    </ActionButton>
                  </div>
                </form>
              </div>
            </DataCard>
          ) : (
            <DataCard title="Detail Tiket">
              <p className="text-[#646B7C]">Pilih tiket di sebelah kiri.</p>
            </DataCard>
          )}
        </div>
      </div>

      <SidePanel
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        title="Buat tiket bantuan"
        footer={
          <>
            <ActionButton intent="cancel" onClick={() => setNewOpen(false)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" onClick={handleCreateTicket}>
              Simpan tiket
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <FormField id="tk-title" label="Judul kendala">
            <input
              id="tk-title"
              className="admin-input"
              placeholder="Contoh: Printer kasir tidak merespons"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="tk-cat" label="Kategori">
              <select
                id="tk-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as 'Akun' | 'Bug' | 'Perangkat' | 'Lainnya')}
                className="admin-input"
              >
                <option value="Perangkat">Perangkat</option>
                <option value="Bug">Bug</option>
                <option value="Akun">Akun</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </FormField>
            <FormField id="tk-prio" label="Prioritas">
              <select
                id="tk-prio"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                className="admin-input"
              >
                <option value="Rendah">Rendah</option>
                <option value="Sedang">Sedang</option>
                <option value="Tinggi">Tinggi</option>
              </select>
            </FormField>
          </div>
          <FormField id="tk-msg" label="Deskripsi detail">
            <textarea
              id="tk-msg"
              rows={3}
              className="admin-input"
              placeholder="Jelaskan kendala yang dialami"
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
            />
          </FormField>
        </div>
      </SidePanel>
    </>
  );
};

export default HelpDeskPage;
