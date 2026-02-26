// Класс для управления базой данных
class NotesDB {
    constructor() {
        this.dbName = 'NotesDB';
        this.dbVersion = 1;
        this.db = null;
    }

    // Инициализация базы данных
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Создаем хранилище для заметок
                if (!db.objectStoreNames.contains('notes')) {
                    const store = db.createObjectStore('notes', {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Создаем индексы для поиска
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
        });
    }

    // Получить все заметки
    async getAllNotes() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notes'], 'readonly');
            const store = transaction.objectStore('notes');
            const request = store.getAll();

            request.onsuccess = () => {
                // Сортируем по дате обновления (новые сверху)
                const notes = request.result.sort((a, b) =>
                    new Date(b.updatedAt) - new Date(a.updatedAt)
                );
                resolve(notes);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Добавить заметку
    async addNote(note) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');

            const noteData = {
                ...note,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const request = store.add(noteData);

            request.onsuccess = () => {
                noteData.id = request.result;
                resolve(noteData);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Обновить заметку
    async updateNote(id, note) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');

            const noteData = {
                ...note,
                id,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(noteData);

            request.onsuccess = () => resolve(noteData);
            request.onerror = () => reject(request.error);
        });
    }

    // Удалить заметку
    async deleteNote(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Поиск заметок
    async searchNotes(query) {
        const notes = await this.getAllNotes();
        const searchTerm = query.toLowerCase().trim();

        if (!searchTerm) return notes;

        return notes.filter(note =>
            note.title.toLowerCase().includes(searchTerm) ||
            note.content.toLowerCase().includes(searchTerm)
        );
    }
}

// Класс для управления UI
class NotesApp {
    constructor() {
        this.db = new NotesDB();
        this.currentNoteId = null;
        this.notes = [];
        this.searchTimeout = null;

        // DOM элементы
        this.notesList = document.getElementById('notesList');
        this.noteEditor = document.getElementById('noteEditor');
        this.emptyState = document.getElementById('emptyState');
        this.noteTitle = document.getElementById('noteTitle');
        this.noteContent = document.getElementById('noteContent');
        this.noteDate = document.getElementById('noteDate');
        this.wordCount = document.getElementById('wordCount');
        this.totalNotes = document.getElementById('totalNotes');
        this.searchInput = document.getElementById('searchInput');
        this.deleteModal = document.getElementById('deleteModal');
        this.deleteNoteTitle = document.getElementById('deleteNoteTitle');

        // Кнопки
        this.addNoteBtn = document.getElementById('addNoteBtn');
        this.emptyStateBtn = document.getElementById('emptyStateBtn');
        this.saveNoteBtn = document.getElementById('saveNoteBtn');
        this.deleteNoteBtn = document.getElementById('deleteNoteBtn');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

        this.init();
    }

    async init() {
        await this.db.init();
        await this.loadNotes();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Кнопки добавления
        this.addNoteBtn.addEventListener('click', () => this.createNewNote());
        this.emptyStateBtn.addEventListener('click', () => this.createNewNote());

        // Сохранение
        this.saveNoteBtn.addEventListener('click', () => this.saveNote());

        // Удаление
        this.deleteNoteBtn.addEventListener('click', () => this.showDeleteModal());

        // Поиск с debounce
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.searchNotes(e.target.value);
            }, 300);
        });

        // Подсчет слов при вводе
        this.noteContent.addEventListener('input', () => this.updateWordCount());
        this.noteTitle.addEventListener('input', () => this.updateWordCount());

        // Модальное окно
        this.closeModalBtn.addEventListener('click', () => this.hideDeleteModal());
        this.cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
        this.confirmDeleteBtn.addEventListener('click', () => this.deleteNote());

        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (e) => {
            if (e.target === this.deleteModal) {
                this.hideDeleteModal();
            }
        });

        // Горячие клавиши
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveNote();
            }
            if (e.key === 'Escape' && this.deleteModal.classList.contains('show')) {
                this.hideDeleteModal();
            }
        });
    }

    async loadNotes() {
        this.notes = await this.db.getAllNotes();
        this.renderNotesList();
        this.updateStats();

        if (this.notes.length > 0) {
            this.loadNote(this.notes[0].id);
        } else {
            this.showEmptyState();
        }
    }

    renderNotesList() {
        if (this.notes.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-notes">
                    <p>Нет заметок</p>
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = this.notes.map(note => `
            <div class="note-item ${note.id === this.currentNoteId ? 'active' : ''}"
                 data-note-id="${note.id}">
                <div class="note-item-header">
                    <span class="note-item-title">${this.escapeHtml(note.title) || 'Без названия'}</span>
                    <span class="note-item-date">${this.formatDate(note.updatedAt)}</span>
                </div>
                <div class="note-item-preview">
                    ${this.escapeHtml(this.getPreview(note.content))}
                </div>
            </div>
        `).join('');

        // Добавляем обработчики кликов
        document.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = Number(item.dataset.noteId);
                this.loadNote(noteId);
            });
        });
    }

    loadNote(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.currentNoteId = id;
        this.noteTitle.value = note.title || '';
        this.noteContent.value = note.content || '';
        this.noteDate.textContent = `Создано: ${this.formatDate(note.createdAt)} • Обновлено: ${this.formatDate(note.updatedAt)}`;

        this.updateWordCount();
        this.showEditor();
        this.renderNotesList(); // Обновляем активное состояние
    }

    async saveNote() {
        if (!this.currentNoteId) return;

        const noteData = {
            title: this.noteTitle.value.trim() || 'Без названия',
            content: this.noteContent.value
        };

        const updatedNote = await this.db.updateNote(this.currentNoteId, noteData);

        // Обновляем заметку в массиве
        const index = this.notes.findIndex(n => n.id === this.currentNoteId);
        this.notes[index] = updatedNote;

        // Перемещаем заметку вверх (так как обновлена)
        this.notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        this.renderNotesList();
        this.noteDate.textContent = `Создано: ${this.formatDate(updatedNote.createdAt)} • Обновлено: ${this.formatDate(updatedNote.updatedAt)}`;
        this.updateStats();

        // Показываем уведомление
        this.showNotification('Заметка сохранена', 'success');
    }

    async createNewNote() {
        const newNote = await this.db.addNote({
            title: 'Новая заметка',
            content: ''
        });

        this.notes.unshift(newNote);
        this.currentNoteId = newNote.id;

        this.renderNotesList();
        this.loadNote(newNote.id);
        this.updateStats();

        // Фокус на заголовок
        this.noteTitle.focus();
        this.noteTitle.select();

        this.showNotification('Заметка создана', 'success');
    }

    showDeleteModal() {
        if (!this.currentNoteId) return;

        const note = this.notes.find(n => n.id === this.currentNoteId);
        this.deleteNoteTitle.textContent = note.title || 'Без названия';
        this.deleteModal.classList.add('show');
    }

    hideDeleteModal() {
        this.deleteModal.classList.remove('show');
    }

    async deleteNote() {
        if (!this.currentNoteId) return;

        await this.db.deleteNote(this.currentNoteId);

        // Удаляем из массива
        this.notes = this.notes.filter(n => n.id !== this.currentNoteId);

        this.hideDeleteModal();

        if (this.notes.length > 0) {
            this.loadNote(this.notes[0].id);
        } else {
            this.currentNoteId = null;
            this.showEmptyState();
        }

        this.renderNotesList();
        this.updateStats();
        this.showNotification('Заметка удалена', 'info');
    }

    async searchNotes(query) {
        this.notes = await this.db.searchNotes(query);
        this.renderNotesList();
        this.updateStats();

        if (this.notes.length > 0) {
            // Если текущая заметка не в результатах поиска, загружаем первую
            if (!this.notes.some(n => n.id === this.currentNoteId)) {
                this.loadNote(this.notes[0].id);
            }
        } else {
            this.showEmptyState();
        }
    }

    updateWordCount() {
        const text = this.noteContent.value;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.wordCount.textContent = `${words} ${this.pluralize(words, 'слово', 'слова', 'слов')}`;
    }

    updateStats() {
        this.totalNotes.textContent = this.notes.length;
    }

    showEditor() {
        this.noteEditor.style.display = 'flex';
        this.emptyState.style.display = 'none';
    }

    showEmptyState() {
        this.noteEditor.style.display = 'none';
        this.emptyState.style.display = 'flex';
    }

    showNotification(message, type) {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#48bb78' : '#4299e1'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1001;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Вспомогательные функции
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Сегодня';
        } else if (diffDays === 1) {
            return 'Вчера';
        } else if (diffDays < 7) {
            return `${diffDays} ${this.pluralize(diffDays, 'день', 'дня', 'дней')} назад`;
        } else {
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        }
    }

    getPreview(content) {
        if (!content) return 'Пустая заметка';
        const plainText = content.replace(/<[^>]*>/g, '');
        return plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
    }

    pluralize(number, one, few, many) {
        if (number % 10 === 1 && number % 100 !== 11) {
            return one;
        } else if (number % 10 >= 2 && number % 10 <= 4 && (number % 100 < 10 || number % 100 >= 20)) {
            return few;
        } else {
            return many;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Добавляем анимации
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    .empty-notes {
        text-align: center;
        color: #999;
        padding: 40px 20px;
    }

    .notification {
        font-family: 'Inter', sans-serif;
        font-weight: 500;
    }
`;
document.head.appendChild(style);

// Запускаем приложение
document.addEventListener('DOMContentLoaded', () => {
    new NotesApp();
});